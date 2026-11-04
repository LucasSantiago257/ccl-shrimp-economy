package br.com.camarao.correction;

import br.com.camarao.closing.PeriodGuard;
import br.com.camarao.shared.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class CorrectionService {
    public enum Kind { SALE, PURCHASE, EXPENSE, PAYMENT, LOSS }
    public record Request(@NotBlank @Size(min=5,max=500) String reason) {}
    public record Replacement(@Positive long sourceId) {}
    private final Sql sql;
    private final PeriodGuard periods;
    private final Idempotency idempotency;
    public CorrectionService(Sql sql,PeriodGuard periods,Idempotency idempotency) {
        this.sql=sql;
        this.periods=periods;
        this.idempotency=idempotency;
    }

    private String table(Kind kind) {
        return switch(kind) {
            case SALE -> "sales";
            case PURCHASE -> "purchases";
            case EXPENSE -> "expenses";
            case PAYMENT -> "settlements";
            case LOSS -> "stock_movements";
        };
    }

    private Mono<Map<String,Object>> source(Kind kind,long id) {
        String fields="d.*";
        String join="";
        if(kind==Kind.SALE) {
            fields+=",p.name AS party_name";
            join=" LEFT JOIN customers p ON p.id=d.customer_id";
        } else if(kind==Kind.PURCHASE) {
            fields+=",COALESCE(p.name,'Fornecedor não informado') AS party_name";
            join=" LEFT JOIN suppliers p ON p.id=d.supplier_id";
        }
        return sql.one("SELECT "+fields+" FROM "+table(kind)+" d"+join+" WHERE d.id=:id",Map.of("id",id))
            .switchIfEmpty(Mono.error(Rules.missing("Lançamento não encontrado.")))
            .doOnNext(row -> Rules.require(kind!=Kind.LOSS || "LOSS".equals(row.get("type")),"Selecione um movimento de perda."));
    }

    private Mono<List<Map<String,Object>>> movements(Kind kind,long id) {
        String condition=switch(kind) {
            case SALE -> "m.sale_item_id IN (SELECT id FROM sale_items WHERE sale_id=:id)";
            case PURCHASE -> "m.purchase_item_id IN (SELECT id FROM purchase_items WHERE purchase_id=:id)";
            case LOSS -> "m.id=:id";
            default -> "FALSE";
        };
        Map<String,Object> params=kind==Kind.EXPENSE || kind==Kind.PAYMENT ? Map.of() : Map.of("id",id);
        return sql.all("SELECT m.*,p.name AS product_name FROM stock_movements m JOIN products p ON p.id=m.product_id WHERE "+condition+" ORDER BY m.product_id",params).collectList();
    }

    private String titleColumn(Kind kind) {
        return switch(kind) {
            case SALE -> "sale_id";
            case PURCHASE -> "purchase_id";
            case EXPENSE -> "expense_id";
            default -> throw new IllegalArgumentException("Sem título financeiro.");
        };
    }

    private Mono<List<Map<String,Object>>> payments(Kind kind,long id) {
        if(kind==Kind.PAYMENT || kind==Kind.LOSS) return Mono.just(List.of());
        return sql.all("SELECT DISTINCT s.id,s.direction,s.amount FROM settlements s JOIN settlement_allocations a ON a.settlement_id=s.id JOIN financial_titles t ON t.id=a.title_id LEFT JOIN corrections c ON c.kind='PAYMENT' AND c.source_id=s.id WHERE t."+titleColumn(kind)+"=:id AND c.id IS NULL ORDER BY s.id",Map.of("id",id)).collectList();
    }

    private Mono<List<Map<String,Object>>> dependencies(List<Map<String,Object>> movements) {
        return Flux.fromIterable(movements).concatMap(m ->
            sql.all("SELECT n.id,n.type,n.product_id,COALESCE(s.sale_id,p.purchase_id,n.id) AS source_id FROM stock_movements n LEFT JOIN sale_items s ON s.id=n.sale_item_id LEFT JOIN purchase_items p ON p.id=n.purchase_item_id LEFT JOIN correction_stock r ON r.movement_id=n.id WHERE n.product_id=:product AND n.id>:id AND r.id IS NULL ORDER BY n.id DESC",
                Map.of("product",m.get("product_id"),"id",m.get("id")))).collectList();
    }

    @Transactional(readOnly=true)
    public Mono<Map<String,Object>> preview(Kind kind,long id) {
        return source(kind,id).flatMap(original ->
            allocations(kind,id).flatMap(allocations ->
            movements(kind,id).flatMap(stock -> payments(kind,id).flatMap(payments ->
                dependencies(stock).flatMap(later ->
                    sql.one("SELECT c.*,r.source_id AS replacement_id FROM corrections c LEFT JOIN correction_replacements r ON r.correction_id=c.id WHERE c.kind=:kind AND c.source_id=:id",
                        Map.of("kind",kind.name(),"id",id)).defaultIfEmpty(Map.of()).map(correction ->
                            Map.<String,Object>of("kind",kind,"sourceId",id,"original",original,"stock",stock,
                                "payments",payments,"dependencies",later,"correction",correction,"allocations",allocations)))))));
    }

    private Mono<List<Map<String,Object>>> allocations(Kind kind,long id) {
        if(kind!=Kind.PAYMENT) return Mono.just(List.of());
        return sql.all("SELECT a.title_id,a.amount,t.sale_id,t.purchase_id,t.expense_id FROM settlement_allocations a JOIN financial_titles t ON t.id=a.title_id WHERE a.settlement_id=:id ORDER BY a.title_id",Map.of("id",id)).collectList();
    }

    @Transactional
    public Mono<Map<String,Long>> cancel(String key,Kind kind,long id,Request request,String actor) {
        Rules.require(request.reason().trim().length()>=5,"Informe um motivo com pelo menos cinco caracteres.");
        var payload=Map.of("kind",kind,"sourceId",id,"reason",request.reason());
        return idempotency.run(key,"CORRECTION",payload,actor,() ->
            periods.requireOpenDay().flatMap(now -> performCancellation(kind,id,request.reason().trim(),actor,now)));
    }

    private Mono<Long> performCancellation(Kind kind,long id,String reason,String actor,LocalDateTime now) {
        return source(kind,id).then(requireUncancelled(kind,id)).then(payments(kind,id)).flatMap(payments -> {
            if(!payments.isEmpty()) throw Rules.conflict("Cancele primeiro os pagamentos vinculados: "+payments.stream().map(p -> "#"+p.get("id")).toList()+". Confira todas as contas abrangidas pelo pagamento.");
            return movements(kind,id);
        }).flatMap(stock -> dependencies(stock).flatMap(later -> {
            if(!later.isEmpty()) throw Rules.conflict("Há movimentos posteriores deste produto. Corrija-os primeiro, do mais recente para o mais antigo. Consulte a prévia.");
            return sql.insert("INSERT INTO corrections(kind,source_id,reason,occurred_at,created_by) VALUES(:kind,:id,:reason,:at,:actor)",
                Map.of("kind",kind.name(),"id",id,"reason",reason,"at",now,"actor",actor))
                .flatMap(correctionId -> Flux.fromIterable(stock)
                    .concatMap(m -> reverseStock(correctionId,m)).then(Mono.just(correctionId)));
        }));
    }

    private Mono<Void> requireUncancelled(Kind kind,long id) {
        return sql.one("SELECT id FROM corrections WHERE kind=:kind AND source_id=:id",Map.of("kind",kind.name(),"id",id))
            .flatMap(existing -> Mono.error(Rules.conflict("Este lançamento já foi cancelado."))).then();
    }

    private Mono<Void> reverseStock(long correctionId,Map<String,Object> movement) {
        long product=Sql.id(movement,"product_id");
        return sql.one("SELECT * FROM stock_balances WHERE product_id=:id FOR UPDATE",Map.of("id",product))
            .switchIfEmpty(Mono.error(Rules.conflict("Saldo de estoque não encontrado.")))
            .flatMap(balance -> {
                BigDecimal quantity=Sql.decimal(balance,"quantity").subtract(Sql.decimal(movement,"quantity_delta"));
                BigDecimal value=Sql.decimal(balance,"stock_value").subtract(Sql.decimal(movement,"value_delta"));
                Rules.require(quantity.signum()>=0 && value.signum()>=0,"O cancelamento deixaria estoque ou valor negativo.");
                Rules.require(quantity.signum()!=0 || value.signum()==0,"O valor do estoque não pode ficar sem quantidade.");
                BigDecimal average=quantity.signum()==0 ? BigDecimal.ZERO : value.divide(quantity,6,RoundingMode.HALF_UP);
                return sql.update("UPDATE stock_balances SET quantity=:quantity,stock_value=:value,average_cost=:average WHERE product_id=:id",
                    Map.of("quantity",quantity,"value",value,"average",average,"id",product))
                    .then(sql.insert("INSERT INTO correction_stock(correction_id,movement_id) VALUES(:correction,:movement)",
                        Map.of("correction",correctionId,"movement",movement.get("id"))));
            }).then();
    }

    @Transactional
    public Mono<Map<String,Long>> link(String key,long correctionId,Replacement replacement,String actor) {
        return idempotency.run(key,"REPLACEMENT",Map.of("correctionId",correctionId,"sourceId",replacement.sourceId()),actor,() ->
            periods.requireOpenDay().flatMap(now ->
                sql.one("SELECT * FROM corrections WHERE id=:id",Map.of("id",correctionId))
                    .switchIfEmpty(Mono.error(Rules.missing("Correção não encontrada.")))
                    .flatMap(correction -> {
                        Kind kind=Kind.valueOf((String)correction.get("kind"));
                        Rules.require(Sql.id(correction,"source_id")!=replacement.sourceId(),"O substituto deve ser outro lançamento.");
                        return source(kind,replacement.sourceId()).flatMap(original -> {
                            Rules.require(!((LocalDateTime)original.get("occurred_at")).isBefore((LocalDateTime)correction.get("occurred_at")),"Cadastre o lançamento correto após o cancelamento.");
                            return sql.one("SELECT id FROM corrections WHERE kind=:kind AND source_id=:source",Map.of("kind",kind.name(),"source",replacement.sourceId()))
                                .flatMap(row -> Mono.<Long>error(Rules.conflict("O substituto também foi cancelado.")))
                                .switchIfEmpty(Mono.defer(() -> sql.one("SELECT correction_id FROM correction_replacements WHERE correction_id=:id OR (kind=:kind AND source_id=:source)",
                                    Map.of("id",correctionId,"kind",kind.name(),"source",replacement.sourceId()))
                                    .flatMap(row -> Mono.<Long>error(Rules.conflict("Já existe um vínculo para esta correção ou para este substituto.")))
                                    .switchIfEmpty(Mono.defer(() -> sql.update("INSERT INTO correction_replacements(correction_id,kind,source_id,occurred_at,created_by) VALUES(:id,:kind,:source,:at,:actor)",
                                        Map.of("id",correctionId,"kind",kind.name(),"source",replacement.sourceId(),"at",now,"actor",actor)).thenReturn(correctionId)))));
                        });
                    })));
    }

    public Mono<PageResult> list(PageQuery page) {
        return sql.page("SELECT c.*,r.source_id AS replacement_id FROM corrections c LEFT JOIN correction_replacements r ON r.correction_id=c.id WHERE c.reason LIKE :q ESCAPE '!' OR CAST(c.source_id AS CHAR) LIKE :q ESCAPE '!' OR CAST(c.id AS CHAR) LIKE :q ESCAPE '!'",
            "c.id DESC",Map.of("q",page.like()),page);
    }

    public Mono<PageResult> candidates(long correctionId,PageQuery page) {
        return sql.one("SELECT kind,occurred_at FROM corrections WHERE id=:id",Map.of("id",correctionId))
            .switchIfEmpty(Mono.error(Rules.missing("Correção não encontrada.")))
            .flatMap(c -> {
                var kind=Kind.valueOf((String)c.get("kind"));
                String loss=kind==Kind.LOSS ? " AND d.type='LOSS'" : "";
                return sql.page("SELECT d.*,'Lançamento' AS name FROM "+table(kind)+" d WHERE d.occurred_at>=:at"+loss+" AND CAST(d.id AS CHAR) LIKE :q ESCAPE '!' AND NOT EXISTS(SELECT 1 FROM corrections x WHERE x.kind=:kind AND x.source_id=d.id) AND NOT EXISTS(SELECT 1 FROM correction_replacements r WHERE r.kind=:kind AND r.source_id=d.id)",
                    "d.id DESC",Map.of("at",c.get("occurred_at"),"q",page.like(),"kind",kind.name()),page);
            });
    }
}

