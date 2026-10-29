package br.com.camarao.trade;

import br.com.camarao.catalog.CatalogService;
import br.com.camarao.closing.PeriodGuard;
import br.com.camarao.finance.FinanceService;
import br.com.camarao.shared.*;
import br.com.camarao.stock.StockService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class TradeService {
    public record Item(@Positive long productId,
        @NotNull @DecimalMin("0.001") @Digits(integer=10,fraction=3) BigDecimal quantity,
        @NotNull @DecimalMin("0.000001") @Digits(integer=12,fraction=6) BigDecimal unitPrice) {
        public BigDecimal total() { return Rules.money(quantity.multiply(unitPrice)); }
    }
    public record Trade(@Positive Long partyId,@NotEmpty @Size(max=100) List<@Valid Item> items,
        @NotNull @DecimalMin("0") @Digits(integer=12,fraction=2) BigDecimal paidAmount,
        @NotBlank @Pattern(regexp="CASH|PIX|TRANSFER|CARD") String method,@NotNull LocalDate dueDate,Boolean payInFull) {}
    private final Sql sql;
    private final StockService stock;
    private final FinanceService finance;
    private final CatalogService catalog;
    private final Idempotency idempotency;
    private final PeriodGuard periods;
    public TradeService(Sql sql,StockService stock,FinanceService finance,CatalogService catalog,Idempotency idempotency,PeriodGuard periods) {
        this.sql=sql; this.stock=stock; this.finance=finance; this.catalog=catalog; this.idempotency=idempotency; this.periods=periods;
    }
    @Transactional
    public Mono<Map<String,Long>> confirm(boolean sale,String key,Trade trade,String actor) {
        Rules.require(!sale || trade.partyId()!=null,"Informe o cliente da venda.");
        Rules.require(trade.items().stream().map(Item::productId).distinct().count()==trade.items().size(),"Agrupe o mesmo produto em um único item.");
        Rules.require(trade.items().stream().allMatch(i -> i.total().signum()>0),"Cada item precisa totalizar ao menos um centavo.");
        BigDecimal total=trade.items().stream().map(Item::total).reduce(BigDecimal.ZERO,BigDecimal::add);
        Rules.require(total.precision()-total.scale()<=12,"Total da operação acima do limite permitido.");
        BigDecimal paidAmount=Boolean.TRUE.equals(trade.payInFull()) ? total : trade.paidAmount();
        Rules.require(paidAmount.compareTo(total)<=0,"O pagamento excede o total da operação.");
        return idempotency.run(key,sale?"SALE":"PURCHASE",trade,actor,() -> periods.requireOpenDay().flatMap(now -> {
            String table=sale?"sales":"purchases",party=sale?"customer_id":"supplier_id";
            String cost=sale?",cost_total":"",costValue=sale?",0":"";
            var params=new HashMap<String,Object>(Map.of("total",total,"at",now,"actor",actor));
            params.put("party",trade.partyId());
            Mono<Void> partner=trade.partyId()==null ? Mono.empty() : catalog.requireActivePartner(sale,trade.partyId());
            return partner.then(sql.insert("INSERT INTO "+table+"("+party+",total,occurred_at,created_by"+cost+") VALUES(:party,:total,:at,:actor"+costValue+")",params))
                .flatMap(id -> Flux.fromIterable(trade.items().stream().sorted(Comparator.comparingLong(Item::productId)).toList())
                    .concatMap(item -> {
                        if(sale) return stock.consume(item.productId(),item.quantity()).flatMap(consumption ->
                            sql.insert("INSERT INTO sale_items(sale_id,product_id,quantity,unit_price,total,cost_unit,cost_total) VALUES(:doc,:product,:quantity,:price,:total,:unitCost,:cost)",
                                Map.of("doc",id,"product",item.productId(),"quantity",item.quantity(),"price",item.unitPrice(),"total",item.total(),"unitCost",consumption.unitCost(),"cost",consumption.totalCost()))
                                .flatMap(itemId -> stock.movement(item.productId(),"SALE",item.quantity().negate(),consumption.totalCost().negate(),itemId,now,actor))
                                .thenReturn(consumption.totalCost()));
                        return stock.receive(item.productId(),item.quantity(),item.total())
                            .then(sql.insert("INSERT INTO purchase_items(purchase_id,product_id,quantity,unit_price,total) VALUES(:doc,:product,:quantity,:price,:total)",
                                Map.of("doc",id,"product",item.productId(),"quantity",item.quantity(),"price",item.unitPrice(),"total",item.total())))
                            .flatMap(itemId -> stock.movement(item.productId(),"PURCHASE",item.quantity(),item.total(),itemId,now,actor))
                            .thenReturn(BigDecimal.ZERO);
                    }).reduce(BigDecimal.ZERO,BigDecimal::add)
                    .flatMap(costTotal -> sale ? sql.update("UPDATE sales SET cost_total=:cost WHERE id=:id",Map.of("cost",costTotal,"id",id)).thenReturn(id) : Mono.just(id))
                    .flatMap(doc -> finance.tradeTitle(sale,doc,trade.partyId(),total,trade.dueDate(),now))
                    .flatMap(title -> paidAmount.signum()==0 ? Mono.just(id) : finance.settle(List.of(new FinanceService.Allocation(title,paidAmount)),trade.method(),now,actor).thenReturn(id)));
        }));
    }
    public Flux<Map<String,Object>> list(boolean sale) {
        String table=sale?"sales":"purchases",partyTable=sale?"customers":"suppliers",party=sale?"customer_id":"supplier_id",doc=sale?"sale_id":"purchase_id";
        return sql.all("SELECT d.*,COALESCE(p.name,'Fornecedor não informado') AS party_name,(SELECT SUM(i.quantity) FROM "+(sale?"sale_items":"purchase_items")+" i WHERE i."+doc+"=d.id) AS quantity "
            +"FROM "+table+" d LEFT JOIN "+partyTable+" p ON p.id=d."+party+" ORDER BY d.id DESC LIMIT 200",Map.of());
    }
    public Flux<Map<String,Object>> items(boolean sale,long id) {
        return sql.all("SELECT i.*,p.name AS product_name FROM "+(sale?"sale_items":"purchase_items")+" i JOIN products p ON p.id=i.product_id WHERE i."+(sale?"sale_id":"purchase_id")+"=:id ORDER BY i.id",Map.of("id",id));
    }
}
