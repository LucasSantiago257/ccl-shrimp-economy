package br.com.camarao.opening;

import br.com.camarao.catalog.CatalogService;
import br.com.camarao.closing.*;
import br.com.camarao.shared.*;
import br.com.camarao.stock.StockService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.*;

@Service
public class OpeningService {
    public record Stock(@Positive long productId,@NotNull @DecimalMin("0.001") @Digits(integer=10,fraction=3) BigDecimal quantity,
        @NotNull @DecimalMin("0.000001") @Digits(integer=12,fraction=6) BigDecimal unitCost) {}
    public record Debt(@NotBlank @Pattern(regexp="RECEIVABLE|PAYABLE") String nature,@Positive Long partyId,
        @NotBlank @Size(max=250) String description,@NotNull @DecimalMin("0.01") @Digits(integer=12,fraction=2) BigDecimal amount,@NotNull LocalDate dueDate,Boolean purchaseRelated) {}
    public record Request(@NotNull @Digits(integer=12,fraction=2) BigDecimal cashAmount,
        @NotNull @Size(max=100) List<@NotNull @Valid Stock> stock,
        @NotNull @Size(max=200) List<@NotNull @Valid Debt> debts,
        @NotNull @Size(max=500) String note,@AssertTrue boolean confirmed) {}
    public record Undo(@NotBlank @Size(min=5,max=500) String reason) {}
    private final Sql sql;
    private final PeriodGuard periods;
    private final Idempotency idempotency;
    private final StockService stock;
    private final CatalogService catalog;
    public OpeningService(Sql sql,PeriodGuard periods,Idempotency idempotency,StockService stock,CatalogService catalog) {
        this.sql=sql;this.periods=periods;this.idempotency=idempotency;this.stock=stock;this.catalog=catalog;
    }
    private Mono<Long> postings() {
        return sql.one("SELECT (SELECT COUNT(*) FROM stock_movements)+(SELECT COUNT(*) FROM sales)+(SELECT COUNT(*) FROM purchases)+(SELECT COUNT(*) FROM expenses)+(SELECT COUNT(*) FROM settlements) AS total",Map.of()).map(r->Sql.id(r,"total"));
    }
    private Mono<Map<String,Object>> active() {
        return sql.one("SELECT b.* FROM opening_balances b LEFT JOIN opening_reversals r ON r.opening_id=b.id WHERE r.opening_id IS NULL ORDER BY b.id DESC LIMIT 1",Map.of());
    }
    private Mono<Void> requireNoPostings() {
        return postings().doOnNext(n->Rules.require(n==0,"O saldo inicial deve ser configurado antes do primeiro lançamento operacional, para evitar contagem em dobro.")).then();
    }
    @Transactional(readOnly=true)
    public Mono<Map<String,Object>> status() {
        return postings().flatMap(count->active().defaultIfEmpty(Map.of()).flatMap(current->{
            var result=new LinkedHashMap<String,Object>();result.put("configured",!current.isEmpty());result.put("hasPostings",count>0);result.put("date",ClosingSchedule.day(periods.now()));result.put("opening",current);
            if(current.isEmpty()) {result.put("stock",List.of());result.put("debts",List.of());result.put("canUndo",false);return Mono.just(result);}
            long id=Sql.id(current,"id");
            boolean sameDay=ClosingSchedule.day((LocalDateTime)current.get("occurred_at")).equals(ClosingSchedule.day(periods.now()));
            result.put("canUndo",count==0 && sameDay && !ClosingSchedule.reachedCutoff(periods.now()));
            return sql.all("SELECT * FROM opening_stock WHERE opening_id=:id ORDER BY id",Map.of("id",id)).collectList().flatMap(rows->{result.put("stock",rows);return sql.all("SELECT * FROM financial_titles WHERE opening_id=:id ORDER BY id",Map.of("id",id)).collectList();})
                .map(rows->{result.put("debts",rows);return result;});
        })).flatMap(result->sql.one("SELECT COUNT(*) AS total FROM period_closures WHERE date_from<=:day AND date_to>=:day",Map.of("day",ClosingSchedule.day(periods.now())))
            .map(row->{boolean closed=Sql.id(row,"total")>0 || ClosingSchedule.reachedCutoff(periods.now());result.put("dayClosed",closed);if(closed)result.put("canUndo",false);return result;}));
    }
    @Transactional
    public Mono<Map<String,Long>> confirm(String key,Request body,String actor) {
        Rules.require(body.stock().stream().map(Stock::productId).distinct().count()==body.stock().size(),"Informe cada produto uma única vez.");
        Rules.require(body.debts().stream().allMatch(d->!d.nature().equals("RECEIVABLE") || d.partyId()!=null),"Informe o cliente de cada conta a receber.");
        Rules.require(body.debts().stream().noneMatch(d->d.nature().equals("RECEIVABLE") && Boolean.TRUE.equals(d.purchaseRelated())),"Uma conta a receber não pode ser dívida de compra.");
        return idempotency.run(key,"OPENING",body,actor,()->periods.requireOpenDay().flatMap(now->requireNoPostings()
            .then(active().flatMap(existing->Mono.<Long>error(Rules.conflict("O saldo inicial já foi configurado.")))
                .switchIfEmpty(Mono.defer(()->create(body,actor,now))))));
    }
    private Mono<Long> create(Request body,String actor,LocalDateTime now) {
        return sql.insert("INSERT INTO opening_balances(cash_amount,note,occurred_at,created_by) VALUES(:cash,:note,:at,:actor)",Map.of("cash",body.cashAmount(),"note",body.note().trim(),"at",now,"actor",actor))
            .flatMap(id->Flux.fromIterable(body.stock().stream().sorted(Comparator.comparingLong(Stock::productId)).toList()).concatMap(item->{
                BigDecimal cost=item.quantity().multiply(item.unitCost()).setScale(6,RoundingMode.HALF_UP);
                Rules.require(cost.signum()>0 && cost.precision()-cost.scale()<=13,"O valor do estoque deve ser positivo e estar dentro do limite permitido.");
                return stock.receive(item.productId(),item.quantity(),cost)
                    .then(sql.one("SELECT name,code FROM products WHERE id=:id",Map.of("id",item.productId())))
                    .flatMap(p->sql.insert("INSERT INTO opening_stock(opening_id,product_id,product_name,product_code,quantity,unit_cost,total_cost) VALUES(:opening,:product,:name,:code,:quantity,:cost,:total)",
                        Map.of("opening",id,"product",item.productId(),"name",p.get("name"),"code",p.get("code"),"quantity",item.quantity(),"cost",item.unitCost(),"total",cost)));
            }).thenMany(Flux.fromIterable(body.debts()).concatMap(debt->{
                boolean customer=debt.nature().equals("RECEIVABLE");
                var params=new HashMap<String,Object>(Map.of("opening",id,"nature",debt.nature(),"description",debt.description().trim(),"amount",debt.amount(),"due",debt.dueDate(),"at",now,"purchase",Boolean.TRUE.equals(debt.purchaseRelated())));params.put("party",debt.partyId());
                Mono<Void> partner=debt.partyId()==null?Mono.empty():catalog.requireActivePartner(customer,debt.partyId());
                return partner.then(sql.insert("INSERT INTO financial_titles(nature,"+(customer?"customer_id":"supplier_id")+",amount,issued_at,due_date,opening_id,opening_description,opening_purchase) VALUES(:nature,:party,:amount,:at,:due,:opening,:description,:purchase)",params));
            })).then(Mono.just(id)));
    }
    @Transactional
    public Mono<Map<String,Long>> undo(String key,long id,Undo body,String actor) {
        Rules.require(body.reason().trim().length()>=5,"Informe o motivo com pelo menos cinco caracteres.");
        return idempotency.run(key,"UNDO_OPENING",Map.of("id",id,"reason",body.reason()),actor,()->periods.requireOpenDay().flatMap(now->requireNoPostings().then(active())
            .switchIfEmpty(Mono.error(Rules.conflict("Não há saldo inicial ativo."))).flatMap(current->{
                Rules.require(Sql.id(current,"id")==id,"O saldo inicial selecionado não está ativo.");
                Rules.require(ClosingSchedule.day((LocalDateTime)current.get("occurred_at")).equals(ClosingSchedule.day(now)),"A implantação só pode ser desfeita no mesmo dia, antes do fechamento e dos primeiros lançamentos.");
                return sql.update("INSERT INTO opening_reversals(opening_id,reason,occurred_at,created_by) VALUES(:opening,:reason,:at,:actor)",Map.of("opening",id,"reason",body.reason().trim(),"at",now,"actor",actor))
                    .then(sql.update("UPDATE stock_balances b JOIN opening_stock s ON s.product_id=b.product_id SET b.quantity=0,b.stock_value=0,b.average_cost=0 WHERE s.opening_id=:id",Map.of("id",id))).thenReturn(id);
            })));
    }
}
