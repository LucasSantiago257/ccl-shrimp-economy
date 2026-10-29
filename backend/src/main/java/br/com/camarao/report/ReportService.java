package br.com.camarao.report;

import br.com.camarao.shared.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Mono;

@Service
public class ReportService {
    private final Sql sql;
    public ReportService(Sql sql) { this.sql=sql; }
    @Transactional(readOnly=true)
    public Mono<Map<String,Object>> report(LocalDate from,LocalDate to) {
        Rules.require(!from.isAfter(to) && ChronoUnit.DAYS.between(from,to)<=3660,"Informe um período válido de até dez anos.");
        var start=Rules.start(from); var end=Rules.start(to.plusDays(1));
        String query="""
            SELECT
              (SELECT COALESCE(SUM(total),0) FROM sales WHERE occurred_at>=:from AND occurred_at<:to) AS revenue,
              (SELECT COALESCE(SUM(cost_total),0) FROM sales WHERE occurred_at>=:from AND occurred_at<:to) AS cost_of_goods,
              (SELECT COALESCE(SUM(total),0) FROM purchases WHERE occurred_at>=:from AND occurred_at<:to) AS purchases,
              (SELECT COALESCE(SUM(total),0) FROM expenses WHERE occurred_at>=:from AND occurred_at<:to) AS expenses,
              (SELECT COALESCE(-SUM(value_delta),0) FROM stock_movements WHERE type='LOSS' AND occurred_at>=:from AND occurred_at<:to) AS losses,
              (SELECT COALESCE(SUM(quantity_delta),0) FROM stock_movements WHERE type='PURCHASE' AND occurred_at>=:from AND occurred_at<:to) AS purchased_kg,
              (SELECT COALESCE(-SUM(quantity_delta),0) FROM stock_movements WHERE type='SALE' AND occurred_at>=:from AND occurred_at<:to) AS sold_kg,
              (SELECT COALESCE(-SUM(quantity_delta),0) FROM stock_movements WHERE type='LOSS' AND occurred_at>=:from AND occurred_at<:to) AS lost_kg,
              (SELECT COALESCE(SUM(amount),0) FROM settlements WHERE direction='IN' AND occurred_at>=:from AND occurred_at<:to) AS received,
              (SELECT COALESCE(SUM(amount),0) FROM settlements WHERE direction='OUT' AND occurred_at>=:from AND occurred_at<:to) AS paid,
              (SELECT COALESCE(SUM(CASE WHEN direction='IN' THEN amount ELSE -amount END),0) FROM settlements WHERE occurred_at<:from) AS opening_cash,
              (SELECT COALESCE(SUM(CASE WHEN direction='IN' THEN amount ELSE -amount END),0) FROM settlements WHERE occurred_at<:to) AS closing_cash,
              (SELECT COALESCE(SUM(t.amount-COALESCE(a.paid,0)),0) FROM financial_titles t
                LEFT JOIN (SELECT a.title_id,SUM(a.amount) paid FROM settlement_allocations a JOIN settlements s ON s.id=a.settlement_id WHERE s.occurred_at<:to GROUP BY a.title_id) a ON a.title_id=t.id
                WHERE t.nature='RECEIVABLE' AND t.issued_at<:to) AS receivables,
              (SELECT COALESCE(SUM(t.amount-COALESCE(a.paid,0)),0) FROM financial_titles t
                LEFT JOIN (SELECT a.title_id,SUM(a.amount) paid FROM settlement_allocations a JOIN settlements s ON s.id=a.settlement_id WHERE s.occurred_at<:to GROUP BY a.title_id) a ON a.title_id=t.id
                WHERE t.nature='PAYABLE' AND t.issued_at<:to) AS payables,
              (SELECT COALESCE(SUM(t.amount-COALESCE(a.paid,0)),0) FROM financial_titles t
                LEFT JOIN (SELECT a.title_id,SUM(a.amount) paid FROM settlement_allocations a JOIN settlements s ON s.id=a.settlement_id WHERE s.occurred_at<:to GROUP BY a.title_id) a ON a.title_id=t.id
                WHERE t.purchase_id IS NOT NULL AND t.issued_at<:to) AS purchase_payables
            """;
        return sql.one(query,Map.of("from",start,"to",end)).flatMap(metrics -> {
            var m=new LinkedHashMap<String,Object>(metrics);
            BigDecimal gross=Sql.decimal(metrics,"revenue").subtract(Sql.decimal(metrics,"cost_of_goods"));
            m.put("gross_profit",gross);
            m.put("operating_result",gross.subtract(Sql.decimal(metrics,"expenses")).subtract(Sql.decimal(metrics,"losses")));
            m.put("cash_flow",Sql.decimal(metrics,"received").subtract(Sql.decimal(metrics,"paid")));
            return sql.all("SELECT p.id,p.name,COALESCE(SUM(m.quantity_delta),0) AS quantity,COALESCE(SUM(m.value_delta),0) AS stock_value FROM products p "
                +"LEFT JOIN stock_movements m ON m.product_id=p.id AND m.occurred_at<:to GROUP BY p.id ORDER BY p.name",Map.of("to",end)).collectList()
                .map(stock -> Map.<String,Object>of("from",from,"to",to,"timezone",Rules.ZONE.toString(),"metrics",m,"stock",stock));
        });
    }
}
