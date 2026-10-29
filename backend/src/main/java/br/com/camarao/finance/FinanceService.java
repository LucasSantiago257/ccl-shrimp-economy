package br.com.camarao.finance;

import br.com.camarao.shared.*;
import br.com.camarao.closing.PeriodGuard;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class FinanceService {
    public record Allocation(@Positive long titleId,@NotNull @DecimalMin("0.01") @Digits(integer=12,fraction=2) BigDecimal amount) {}
    public record Payment(@NotBlank @Pattern(regexp="CASH|PIX|TRANSFER|CARD") String method,
        @NotEmpty @Size(max=100) List<@Valid Allocation> allocations) {}
    public record Expense(@NotBlank @Size(max=250) String description,@NotBlank @Size(max=80) String category,
        @NotNull @DecimalMin("0.01") @Digits(integer=12,fraction=2) BigDecimal amount,
        @NotNull @DecimalMin("0") @Digits(integer=12,fraction=2) BigDecimal paidAmount,
        @NotBlank @Pattern(regexp="CASH|PIX|TRANSFER|CARD") String method,@NotNull LocalDate dueDate) {}
    private final Sql sql;
    private final Idempotency idempotency;
    private final PeriodGuard periods;
    public FinanceService(Sql sql,Idempotency idempotency,PeriodGuard periods) { this.sql=sql; this.idempotency=idempotency; this.periods=periods; }
    public Mono<Long> tradeTitle(boolean sale,long documentId,Long partyId,BigDecimal total,LocalDate due,LocalDateTime now) {
        String document=sale?"sale_id":"purchase_id", party=sale?"customer_id":"supplier_id";
        var params=new HashMap<String,Object>(Map.of("nature",sale?"RECEIVABLE":"PAYABLE","doc",documentId,"amount",total,"at",now,"due",due));
        params.put("party",partyId);
        return sql.insert("INSERT INTO financial_titles(nature,"+document+","+party+",amount,issued_at,due_date) VALUES(:nature,:doc,:party,:amount,:at,:due)",
            params);
    }
    public Mono<Long> settle(List<Allocation> allocations,String method,LocalDateTime now,String actor) {
        Rules.require(allocations.stream().map(Allocation::titleId).distinct().count()==allocations.size(),"Não repita uma conta no pagamento.");
        var ordered=allocations.stream().sorted(Comparator.comparingLong(Allocation::titleId)).toList();
        return Flux.fromIterable(ordered).concatMap(a -> sql.one("SELECT * FROM financial_titles WHERE id=:id FOR UPDATE",Map.of("id",a.titleId()))
            .switchIfEmpty(Mono.error(Rules.missing("Conta financeira não encontrada.")))
            .flatMap(title -> sql.all("SELECT amount FROM settlement_allocations WHERE title_id=:id FOR UPDATE",Map.of("id",a.titleId()))
                .map(row -> Sql.decimal(row,"amount")).reduce(BigDecimal.ZERO,BigDecimal::add)
                .map(paid -> {
                    Rules.require(a.amount().compareTo(Sql.decimal(title,"amount").subtract(paid))<=0,"O pagamento excede o valor em aberto.");
                    return title;
                }))).collectList().flatMap(titles -> {
                String party=partyKey(titles.getFirst());
                Rules.require(titles.stream().allMatch(t -> party.equals(partyKey(t))),"Selecione contas da mesma pessoa e natureza.");
                BigDecimal total=ordered.stream().map(Allocation::amount).reduce(BigDecimal.ZERO,BigDecimal::add);
                String direction=titles.getFirst().get("nature").equals("RECEIVABLE")?"IN":"OUT";
                return sql.insert("INSERT INTO settlements(direction,amount,method,occurred_at,created_by) VALUES(:direction,:amount,:method,:at,:actor)",
                    Map.of("direction",direction,"amount",total,"method",method,"at",now,"actor",actor))
                    .flatMap(id -> Flux.fromIterable(ordered).concatMap(a -> sql.update("INSERT INTO settlement_allocations(settlement_id,title_id,amount) VALUES(:settlement,:title,:amount)",
                        Map.of("settlement",id,"title",a.titleId(),"amount",a.amount()))).then(Mono.just(id)));
            });
    }
    private String partyKey(Map<String,Object> title) {
        if(title.get("purchase_id")!=null && title.get("supplier_id")==null) return "UNNAMED_PURCHASE:"+title.get("purchase_id");
        return title.get("nature")+":"+Objects.toString(title.get("customer_id"),"")+":"+Objects.toString(title.get("supplier_id"),"");
    }
    @Transactional
    public Mono<Map<String,Long>> payment(String key,Payment payment,String actor) {
        return idempotency.run(key,"PAYMENT",payment,actor,() -> periods.requireOpenDay().flatMap(now -> settle(payment.allocations(),payment.method(),now,actor)));
    }
    @Transactional
    public Mono<Map<String,Long>> expense(String key,Expense expense,String actor) {
        Rules.require(expense.paidAmount().compareTo(expense.amount())<=0,"O pagamento excede o total da despesa.");
        return idempotency.run(key,"EXPENSE",expense,actor,() -> periods.requireOpenDay().flatMap(now -> {
            return sql.insert("INSERT INTO expenses(description,category,total,occurred_at,created_by) VALUES(:description,:category,:total,:at,:actor)",
                Map.of("description",expense.description().trim(),"category",expense.category().trim(),"total",expense.amount(),"at",now,"actor",actor))
                .flatMap(id -> sql.insert("INSERT INTO financial_titles(nature,expense_id,amount,issued_at,due_date) VALUES('PAYABLE',:expense,:amount,:at,:due)",
                    Map.of("expense",id,"amount",expense.amount(),"at",now,"due",expense.dueDate()))
                    .flatMap(title -> expense.paidAmount().signum()==0 ? Mono.just(id) : settle(List.of(new Allocation(title,expense.paidAmount())),expense.method(),now,actor).thenReturn(id)));
        }));
    }
    public Flux<Map<String,Object>> titles(String nature,long customerId,boolean openOnly,boolean purchasesOnly) {
        Rules.require(nature.equals("RECEIVABLE")||nature.equals("PAYABLE"),"Natureza financeira inválida.");
        return sql.all("SELECT t.*,COALESCE(c.name,s.name,e.description,CONCAT('Compra #',t.purchase_id,' · fornecedor não informado')) AS party_name,COALESCE(a.paid,0) AS paid,t.amount-COALESCE(a.paid,0) AS outstanding "
            +"FROM financial_titles t LEFT JOIN customers c ON c.id=t.customer_id LEFT JOIN suppliers s ON s.id=t.supplier_id LEFT JOIN expenses e ON e.id=t.expense_id "
            +"LEFT JOIN (SELECT title_id,SUM(amount) paid FROM settlement_allocations GROUP BY title_id) a ON a.title_id=t.id "
            +"WHERE t.nature=:nature AND (:customer=0 OR t.customer_id=:customer) AND (:openOnly=0 OR t.amount>COALESCE(a.paid,0)) AND (:purchasesOnly=0 OR t.purchase_id IS NOT NULL) ORDER BY t.due_date,t.id LIMIT 500",Map.of("nature",nature,"customer",customerId,"openOnly",openOnly?1:0,"purchasesOnly",purchasesOnly?1:0));
    }
    public Flux<Map<String,Object>> settlements(long customerId) {
        return sql.all("SELECT s.*,GROUP_CONCAT(CONCAT('#',a.title_id,': ',a.amount) ORDER BY a.title_id SEPARATOR '; ') AS allocations "
            +"FROM settlements s JOIN settlement_allocations a ON a.settlement_id=s.id JOIN financial_titles t ON t.id=a.title_id "
            +"WHERE (:customer=0 OR t.customer_id=:customer) GROUP BY s.id ORDER BY s.id DESC LIMIT 200",Map.of("customer",customerId));
    }
    public Flux<Map<String,Object>> expenses() {
        return sql.all("SELECT * FROM expenses ORDER BY id DESC LIMIT 200",Map.of());
    }
}
