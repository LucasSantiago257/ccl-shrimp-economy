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
        @NotNull @DecimalMin("0.000001") @Digits(integer=12,fraction=6) BigDecimal unitPrice,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
        @DecimalMin("0.001") @Digits(integer=10,fraction=3) BigDecimal boxCount,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
        @DecimalMin("0.001") @Digits(integer=6,fraction=3) BigDecimal boxWeightKg) {
        public Item(long productId,BigDecimal quantity,BigDecimal unitPrice){this(productId,quantity,unitPrice,null,null);}
        public void validateBoxes() {
            Rules.require((boxCount==null)==(boxWeightKg==null),"Informe a quantidade de caixas e o peso de cada caixa juntos.");
            if(boxCount!=null) Rules.require(boxCount.signum()>0 && boxWeightKg.signum()>0 && quantity.compareTo(boxCount.multiply(boxWeightKg))==0,
                "Os quilos devem corresponder à quantidade de caixas multiplicada pelo peso de cada caixa, sem arredondamento.");
        }
        public BigDecimal total() { return Rules.money(quantity.multiply(unitPrice)); }
    }
    public record Trade(@Positive Long partyId,@NotEmpty @Size(max=100) List<@NotNull @Valid Item> items,
        @NotNull @DecimalMin("0") @Digits(integer=12,fraction=2) BigDecimal paidAmount,
        @NotBlank @Pattern(regexp="CASH|PIX|TRANSFER|CARD") String method,@NotNull LocalDate dueDate,Boolean payInFull,
        @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
        @DecimalMin("0") @Digits(integer=12,fraction=2) BigDecimal discountAmount) {}
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
        trade.items().forEach(Item::validateBoxes);
        Rules.require(!sale || trade.partyId()!=null,"Informe o cliente da venda.");
        Rules.require(trade.items().stream().map(Item::productId).distinct().count()==trade.items().size(),"Agrupe o mesmo produto em um único item.");
        Rules.require(trade.items().stream().allMatch(i -> i.total().signum()>0),"Cada item precisa totalizar ao menos um centavo.");
        BigDecimal gross=trade.items().stream().map(Item::total).reduce(BigDecimal.ZERO,BigDecimal::add);
        var amounts=SaleAmounts.calculate(gross,trade.discountAmount());
        Rules.require(sale || amounts.discount().signum()==0,"Desconto por documento está disponível apenas para vendas.");
        BigDecimal total=amounts.net();
        Rules.require(gross.precision()-gross.scale()<=12,"Total da operação acima do limite permitido.");
        BigDecimal paidAmount=Boolean.TRUE.equals(trade.payInFull()) ? total : trade.paidAmount();
        Rules.require(paidAmount.compareTo(total)<=0,"O pagamento excede o total da operação.");
        return idempotency.run(key,sale?"SALE":"PURCHASE",trade,actor,() -> periods.requireOpenDay().flatMap(now -> {
            String table=sale?"sales":"purchases",party=sale?"customer_id":"supplier_id";
            String cost=sale?",cost_total,gross_total,discount_amount":"",costValue=sale?",0,:gross,:discount":"";
            var params=new HashMap<String,Object>(Map.of("total",total,"at",now,"actor",actor));
            params.put("party",trade.partyId());
            if(sale) { params.put("gross",gross); params.put("discount",amounts.discount()); }
            Mono<Void> partner=trade.partyId()==null ? Mono.empty() : catalog.requireActivePartner(sale,trade.partyId());
            return partner.then(sql.insert("INSERT INTO "+table+"("+party+",total,occurred_at,created_by"+cost+") VALUES(:party,:total,:at,:actor"+costValue+")",params))
                .flatMap(id -> Flux.fromIterable(trade.items().stream().sorted(Comparator.comparingLong(Item::productId)).toList())
                    .concatMap(item -> {
                        if(sale) return stock.consume(item.productId(),item.quantity()).flatMap(consumption ->
                            sql.insert("INSERT INTO sale_items(sale_id,product_id,quantity,unit_price,total,cost_unit,cost_total) VALUES(:doc,:product,:quantity,:price,:total,:unitCost,:cost)",
                                Map.of("doc",id,"product",item.productId(),"quantity",item.quantity(),"price",item.unitPrice(),"total",item.total(),"unitCost",consumption.unitCost(),"cost",consumption.totalCost()))
                                .flatMap(itemId -> saveBoxes("sale_items",itemId,item).then(stock.movement(item.productId(),"SALE",item.quantity().negate(),consumption.totalCost().negate(),itemId,now,actor)))
                                .thenReturn(consumption.totalCost()));
                        return stock.receive(item.productId(),item.quantity(),item.total())
                            .then(sql.insert("INSERT INTO purchase_items(purchase_id,product_id,quantity,unit_price,total) VALUES(:doc,:product,:quantity,:price,:total)",
                                Map.of("doc",id,"product",item.productId(),"quantity",item.quantity(),"price",item.unitPrice(),"total",item.total())))
                            .flatMap(itemId -> saveBoxes("purchase_items",itemId,item).then(stock.movement(item.productId(),"PURCHASE",item.quantity(),item.total(),itemId,now,actor)))
                            .thenReturn(BigDecimal.ZERO);
                    }).reduce(BigDecimal.ZERO,BigDecimal::add)
                    .flatMap(costTotal -> sale ? sql.update("UPDATE sales SET cost_total=:cost WHERE id=:id",Map.of("cost",costTotal,"id",id)).thenReturn(id) : Mono.just(id))
                    .flatMap(doc -> total.signum()==0 ? Mono.just(id) : finance.tradeTitle(sale,doc,trade.partyId(),total,trade.dueDate(),now))
                    .flatMap(title -> paidAmount.signum()==0 ? Mono.just(id) : finance.settle(List.of(new FinanceService.Allocation(title,paidAmount)),trade.method(),now,actor).thenReturn(id)));
        }));
    }
    private Mono<Void> saveBoxes(String table,long id,Item item) {
        if(item.boxCount()==null)return Mono.empty();
        return sql.update("UPDATE "+table+" SET box_count=:count,box_weight_kg=:weight WHERE id=:id",
            Map.of("count",item.boxCount(),"weight",item.boxWeightKg(),"id",id)).then();
    }
    @Transactional(readOnly=true)
    public Mono<PageResult> list(boolean sale,PageQuery page) {
        return list(sale,page,null,null);
    }

    @Transactional(readOnly=true)
    public Mono<PageResult> list(boolean sale,PageQuery page,LocalDate from,LocalDate to) {
        Rules.require((from==null)==(to==null),"Informe as duas datas do período.");
        if(from!=null) Rules.require(!from.isAfter(to) && java.time.temporal.ChronoUnit.DAYS.between(from,to)<=3660,"Informe um período válido de até dez anos.");
        String table=sale?"sales":"purchases",partyTable=sale?"customers":"suppliers",party=sale?"customer_id":"supplier_id",doc=sale?"sale_id":"purchase_id";
        String base="SELECT d.*,c.id AS correction_id,c.occurred_at AS cancelled_at,COALESCE(p.name,'Fornecedor não informado') AS party_name,(SELECT SUM(i.quantity) FROM "+(sale?"sale_items":"purchase_items")+" i WHERE i."+doc+"=d.id) AS quantity "
            +"FROM "+table+" d LEFT JOIN corrections c ON c.kind='"+(sale?"SALE":"PURCHASE")+"' AND c.source_id=d.id LEFT JOIN "+partyTable+" p ON p.id=d."+party+" WHERE (COALESCE(p.name,'Fornecedor não informado') LIKE :q ESCAPE '!' OR CAST(d.id AS CHAR) LIKE :q ESCAPE '!')";
        var params=new HashMap<String,Object>();
        params.put("q",page.like());
        String window="";
        if(from!=null) {
            params.put("from",Rules.start(from));
            params.put("to",Rules.start(to.plusDays(1)));
            window=" AND d.occurred_at>=:from AND d.occurred_at<:to";
        }
        return sql.page(base+window,"d.id DESC",params,page).flatMap(result -> {
            String gross=sale ? "gross_total" : "total";
            String discount=sale ? "discount_amount" : "0";
            String events="SELECT total,quantity,"+gross+" AS gross_total,"+discount+" AS discount_amount,occurred_at AS event_at,0 AS reversal FROM ("+base+") originals "
                +"UNION ALL SELECT -total,-quantity,-"+gross+",-("+discount+"),cancelled_at,1 FROM ("+base+") cancelled WHERE correction_id IS NOT NULL";
            String filter=from==null ? "" : " WHERE event_at>=:from AND event_at<:to";
            return sql.one("SELECT COALESCE(SUM(total),0) AS total,COALESCE(SUM(quantity),0) AS quantity,COALESCE(SUM(gross_total),0) AS gross_total,COALESCE(SUM(discount_amount),0) AS discount_amount,"
                +"COALESCE(SUM(IF(reversal=0,total,0)),0) AS registered_total,COALESCE(SUM(IF(reversal=1,-total,0)),0) AS reversed_total,COALESCE(SUM(IF(reversal=1,-quantity,0)),0) AS reversed_quantity FROM ("+events+") events"+filter,params)
                .map(summary -> new PageResult(result.items(),result.page(),result.size(),result.total(),result.totalPages(),result.hasNext(),result.hasPrevious(),summary));
        });
    }
    public Flux<Map<String,Object>> items(boolean sale,long id) {
        return sql.all("SELECT i.*,p.name AS product_name FROM "+(sale?"sale_items":"purchase_items")+" i JOIN products p ON p.id=i.product_id WHERE i."+(sale?"sale_id":"purchase_id")+"=:id ORDER BY i.id",Map.of("id",id));
    }
}
