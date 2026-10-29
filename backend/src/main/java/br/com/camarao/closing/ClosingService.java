package br.com.camarao.closing;

import br.com.camarao.report.ReportService;
import br.com.camarao.shared.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class ClosingService {
    public record ClosePeriod(@NotNull LocalDate from,@NotNull LocalDate to,@NotNull @Size(max=500) String note) {}
    private final Sql sql;
    private final PeriodGuard periods;
    private final Idempotency idempotency;
    private final ReportService reports;
    private final ObjectMapper mapper;
    public ClosingService(Sql sql,PeriodGuard periods,Idempotency idempotency,ReportService reports,ObjectMapper mapper) {
        this.sql=sql;this.periods=periods;this.idempotency=idempotency;this.reports=reports;this.mapper=mapper;
    }
    @Transactional
    public Mono<Map<String,Long>> close(String key,ClosePeriod period,String actor) {
        Rules.require(!period.from().isAfter(period.to()) && ChronoUnit.DAYS.between(period.from(),period.to())<=3660,"Informe um período válido de até dez anos.");
        return idempotency.run(key,"CLOSING",period,actor,() -> periods.lock().flatMap(now -> {
            LocalDate today=now.atOffset(ZoneOffset.UTC).atZoneSameInstant(Rules.ZONE).toLocalDate();
            Rules.require(!period.to().isAfter(today),"Não é possível fechar datas futuras.");
            return sql.one("SELECT id FROM period_closures WHERE date_from<=:to AND date_to>=:from LIMIT 1 FOR SHARE",Map.of("from",period.from(),"to",period.to()))
                .flatMap(row -> Mono.<Long>error(Rules.conflict("O intervalo contém datas já fechadas. Consulte o snapshot existente ou escolha outro intervalo.")))
                .switchIfEmpty(Mono.defer(() -> capture(period,actor,now)));
        }));
    }
    private Mono<Long> capture(ClosePeriod period,String actor,LocalDateTime now) {
        return reports.report(period.from(),period.to()).flatMap(report -> records(period).flatMap(records -> {
            var snapshot=new LinkedHashMap<String,Object>();
            snapshot.put("schemaVersion",1); snapshot.put("from",period.from()); snapshot.put("to",period.to());
            snapshot.put("timezone",Rules.ZONE.toString()); snapshot.put("closedAt",now.atOffset(ZoneOffset.UTC));
            snapshot.put("closedBy",actor); snapshot.put("note",period.note().trim());
            snapshot.put("report",report); snapshot.put("records",records);
            try {
                String json=mapper.writeValueAsString(snapshot);
                return sql.insert("INSERT INTO period_closures(date_from,date_to,timezone,closed_at,closed_by,note,schema_version,snapshot_sha256,snapshot_json) VALUES(:from,:to,:zone,:at,:actor,:note,1,:hash,:json)",
                    Map.of("from",period.from(),"to",period.to(),"zone",Rules.ZONE.toString(),"at",now,"actor",actor,"note",period.note().trim(),"hash",sha256(json),"json",json));
            } catch(Exception e) { return Mono.error(new IllegalStateException("Não foi possível preservar o fechamento.",e)); }
        }));
    }
    private Mono<Map<String,Object>> records(ClosePeriod period) {
        var queries=new LinkedHashMap<String,String>();
        queries.put("sales","SELECT s.*,c.name AS customer_name FROM sales s JOIN customers c ON c.id=s.customer_id WHERE s.occurred_at>=:from AND s.occurred_at<:to ORDER BY s.id");
        queries.put("sale_items","SELECT i.*,p.code AS product_code,p.name AS product_name FROM sale_items i JOIN sales s ON s.id=i.sale_id JOIN products p ON p.id=i.product_id WHERE s.occurred_at>=:from AND s.occurred_at<:to ORDER BY i.id");
        queries.put("purchases","SELECT p.*,COALESCE(s.name,'Fornecedor não informado') AS supplier_name FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.occurred_at>=:from AND p.occurred_at<:to ORDER BY p.id");
        queries.put("purchase_items","SELECT i.*,p.code AS product_code,p.name AS product_name FROM purchase_items i JOIN purchases d ON d.id=i.purchase_id JOIN products p ON p.id=i.product_id WHERE d.occurred_at>=:from AND d.occurred_at<:to ORDER BY i.id");
        queries.put("expenses","SELECT * FROM expenses WHERE occurred_at>=:from AND occurred_at<:to ORDER BY id");
        queries.put("stock_movements","SELECT m.*,p.name AS product_name,p.code AS product_code FROM stock_movements m JOIN products p ON p.id=m.product_id WHERE m.occurred_at>=:from AND m.occurred_at<:to ORDER BY m.id");
        queries.put("settlements","SELECT * FROM settlements WHERE occurred_at>=:from AND occurred_at<:to ORDER BY id");
        queries.put("settlement_allocations","SELECT a.* FROM settlement_allocations a JOIN settlements s ON s.id=a.settlement_id WHERE s.occurred_at>=:from AND s.occurred_at<:to ORDER BY a.settlement_id,a.title_id");
        queries.put("titles","SELECT t.*,COALESCE(c.name,s.name,e.description,CONCAT('Compra #',t.purchase_id,' · fornecedor não informado')) AS party_name,COALESCE(a.paid,0) AS paid,t.amount-COALESCE(a.paid,0) AS outstanding FROM financial_titles t LEFT JOIN customers c ON c.id=t.customer_id LEFT JOIN suppliers s ON s.id=t.supplier_id LEFT JOIN expenses e ON e.id=t.expense_id LEFT JOIN (SELECT a.title_id,SUM(a.amount) paid FROM settlement_allocations a JOIN settlements s ON s.id=a.settlement_id WHERE s.occurred_at<:to GROUP BY a.title_id) a ON a.title_id=t.id WHERE t.issued_at<:to ORDER BY t.id");
        queries.put("products","SELECT * FROM products ORDER BY id");
        var result=new LinkedHashMap<String,Object>();
        return Flux.fromIterable(queries.entrySet()).concatMap(entry -> {
            var params=new HashMap<String,Object>();
            if(entry.getValue().contains(":from")) params.put("from",Rules.start(period.from()));
            if(entry.getValue().contains(":to")) params.put("to",Rules.start(period.to().plusDays(1)));
            return sql.all(entry.getValue(),params).collectList().doOnNext(rows -> result.put(entry.getKey(),rows));
        }).then(Mono.just(result));
    }
    public Flux<Map<String,Object>> list() {
        return sql.all("SELECT id,date_from,date_to,timezone,closed_at,closed_by,note,schema_version,snapshot_sha256 FROM period_closures ORDER BY date_to DESC,id DESC",Map.of());
    }
    public Mono<Map<String,Object>> status() {
        var day=Rules.today();
        return sql.one("SELECT id,date_from,date_to,closed_by FROM period_closures WHERE date_from<=:day AND date_to>=:day LIMIT 1",Map.of("day",day))
            .map(row -> Map.<String,Object>of("date",day,"closed",true,"closureId",row.get("id"),"from",row.get("date_from"),"to",row.get("date_to"),"closedBy",row.get("closed_by")))
            .defaultIfEmpty(Map.of("date",day,"closed",false));
    }
    public Mono<Map<String,Object>> detail(long id) {
        return stored(id).map(row -> {
            var metadata=new LinkedHashMap<String,Object>(row); metadata.remove("snapshot_json");
            try { return Map.<String,Object>of("metadata",metadata,"snapshot",mapper.reader().with(com.fasterxml.jackson.databind.DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).readTree((String)row.get("snapshot_json"))); }
            catch(Exception e) { throw new IllegalStateException("Snapshot inválido.",e); }
        });
    }
    public Mono<String> json(long id) { return stored(id).map(row -> (String)row.get("snapshot_json")); }
    private Mono<Map<String,Object>> stored(long id) {
        return sql.one("SELECT * FROM period_closures WHERE id=:id",Map.of("id",id))
            .switchIfEmpty(Mono.error(Rules.missing("Fechamento não encontrado.")))
            .doOnNext(row -> {
                if(!sha256((String)row.get("snapshot_json")).equals(row.get("snapshot_sha256")))
                    throw Rules.conflict("A integridade do snapshot não pôde ser confirmada.");
            });
    }
    public static String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch(Exception e) { throw new IllegalStateException(e); }
    }
}
