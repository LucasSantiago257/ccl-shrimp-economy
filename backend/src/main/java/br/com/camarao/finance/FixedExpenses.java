package br.com.camarao.finance;

import br.com.camarao.closing.PeriodGuard;
import br.com.camarao.shared.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Mono;

@Service
public class FixedExpenses {
    public record Rule(@NotBlank @Size(max=250) String description, @NotBlank @Size(max=80) String category,
                       @NotNull @DecimalMin("0.01") @Digits(integer=12,fraction=2) BigDecimal amount,
                       @NotNull LocalDate firstDue) {}
    private final Sql sql;
    private final FinanceService finance;
    private final PeriodGuard periods;
    private final Idempotency requests;

    public FixedExpenses(Sql sql, FinanceService finance, PeriodGuard periods, Idempotency requests) {
        this.sql=sql; this.finance=finance; this.periods=periods; this.requests=requests;
    }

    private LocalDate day(LocalDateTime now) {
        return now.atOffset(ZoneOffset.UTC).atZoneSameInstant(Rules.ZONE).toLocalDate();
    }

    @Transactional
    public Mono<Map<String,Long>> create(String key, Rule rule, String actor) {
        return requests.run(key,"FIXED_EXPENSE",rule,actor,() -> periods.requireOpenDay().flatMap(now -> {
            Rules.require(!rule.firstDue().isBefore(day(now)), "Escolha um primeiro vencimento a partir de hoje.");
            return sql.insert("INSERT INTO fixed_expense_rules(description,category,amount,monthly_day,next_due,created_by) VALUES(:description,:category,:amount,:day,:due,:actor)",
                Map.of("description",rule.description().trim(),"category",rule.category().trim(),"amount",rule.amount(),
                       "day",rule.firstDue().getDayOfMonth(),"due",rule.firstDue(),"actor",actor))
                .flatMap(id -> postDue(id,now).thenReturn(id));
        }));
    }

    public Mono<PageResult> list(PageQuery page) {
        return sql.page("SELECT * FROM fixed_expense_rules WHERE active=TRUE AND description LIKE :q ESCAPE '!'",
            "next_due,id",Map.of("q",page.like()),page);
    }

    @Transactional
    public Mono<Void> stop(long id) {
        return periods.lock().then(sql.update("UPDATE fixed_expense_rules SET active=FALSE WHERE id=:id",Map.of("id",id))).then();
    }

    private Mono<Long> postDue(long id, LocalDateTime now) {
        return sql.one("SELECT * FROM fixed_expense_rules WHERE id=:id AND active=TRUE AND next_due<=:today FOR UPDATE",
            Map.of("id",id,"today",day(now))).flatMap(row -> {
                LocalDate due=(LocalDate)row.get("next_due");
                YearMonth month=YearMonth.from(due).plusMonths(1);
                LocalDate next=month.atDay(Math.min((int)Sql.id(row,"monthly_day"),month.lengthOfMonth()));
                var expense=new FinanceService.Expense((String)row.get("description"),(String)row.get("category"),
                    Sql.decimal(row,"amount"),BigDecimal.ZERO,"PIX",due);
                return finance.postExpense(expense,(String)row.get("created_by"),now)
                    .flatMap(expenseId -> sql.update("INSERT INTO fixed_expense_occurrences(rule_id,due_date,expense_id) VALUES(:id,:due,:expense)",
                        Map.of("id",id,"due",due,"expense",expenseId)))
                    .then(sql.update("UPDATE fixed_expense_rules SET next_due=:next WHERE id=:id",Map.of("next",next,"id",id)));
            });
    }

    @Transactional
    public Mono<Long> processNext() {
        return sql.one("SELECT id FROM fixed_expense_rules WHERE active=TRUE AND next_due<=:today ORDER BY next_due,id LIMIT 1",
            Map.of("today",day(periods.now())))
            .flatMap(row -> periods.requireOpenDay().flatMap(now -> postDue(Sql.id(row,"id"),now)));
    }
}
