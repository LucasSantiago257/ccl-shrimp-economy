package br.com.camarao.report;

import br.com.camarao.shared.*;
import java.math.BigDecimal;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Mono;

@Service
public class DashboardService {
    private final Sql sql;
    private final ReportService reports;
    public DashboardService(Sql sql, ReportService reports) {
        this.sql = sql;
        this.reports = reports;
    }

    private record Bucket(LocalDate from, LocalDate to) {}
    private static List<Bucket> buckets(LocalDate from, LocalDate to, String grouping) {
        var result = new ArrayList<Bucket>();
        for (var date = from; !date.isAfter(to); ) {
            LocalDate last = switch (grouping) {
                case "week" -> date.plusDays(7 - date.getDayOfWeek().getValue());
                case "month" -> date.withDayOfMonth(date.lengthOfMonth());
                default -> date;
            };
            if (last.isAfter(to)) last = to;
            result.add(new Bucket(date, last));
            date = last.plusDays(1);
        }
        return result;
    }

    @Transactional(readOnly=true)
    public Mono<Map<String,Object>> load(LocalDate from, LocalDate to) {
        long days = ChronoUnit.DAYS.between(from,to) + 1;
        Rules.require(days >= 1 && days <= 366, "Escolha um intervalo de 1 a 366 dias.");
        String grouping = days <= 31 ? "day" : days <= 90 ? "week" : "month";
        var bounds = Map.of("start", Rules.start(from), "end", Rules.start(to.plusDays(1)));
        return reports.report(from,to).flatMap(report ->
            composition(bounds).flatMap(pies ->
                series(buckets(from,to,grouping)).map(points -> Map.<String,Object>of(
                    "from",from,"to",to,"timezone",Rules.ZONE.toString(),"grouping",grouping,
                    "metrics",report.get("metrics"),"stock_kg",stockQuantity(report),
                    "composition",pies,"series",points))));
    }

    @SuppressWarnings("unchecked")
    private BigDecimal stockQuantity(Map<String,Object> report) {
        var products = (List<Map<String,Object>>)report.get("stock");
        return products.stream().map(row -> Sql.decimal(row,"quantity")).reduce(BigDecimal.ZERO,BigDecimal::add);
    }

    private Mono<Map<String,Object>> composition(Map<String,LocalDateTime> bounds) {
        return sql.one("""
            SELECT COALESCE(SUM(IF(t.sale_id IS NOT NULL,t.amount,0)),0) AS sales_total,
                   COALESCE(SUM(IF(t.sale_id IS NOT NULL,a.paid,0)),0) AS sales_paid,
                   COALESCE(SUM(IF(t.purchase_id IS NOT NULL,t.amount,0)),0) AS purchases_total,
                   COALESCE(SUM(IF(t.purchase_id IS NOT NULL,a.paid,0)),0) AS purchases_paid
            FROM title_positions t LEFT JOIN (
                SELECT a.title_id,SUM(a.amount) AS paid
                FROM allocation_events a
                WHERE a.occurred_at<:end GROUP BY a.title_id
            ) a ON a.title_id=t.id
            WHERE (t.cancelled_at IS NULL OR t.cancelled_at>=:end) AND t.issued_at>=:start AND t.issued_at<:end AND (t.sale_id IS NOT NULL OR t.purchase_id IS NOT NULL)
            """,bounds);
    }

    // Aggregate each source independently, so document items and partial payments never multiply a sale.
    private Mono<List<Map<String,Object>>> series(List<Bucket> buckets) {
        var params = new HashMap<String,Object>();
        var ranges = new StringJoiner(" UNION ALL ");
        for (int i=0; i<buckets.size(); i++) {
            var bucket = buckets.get(i);
            ranges.add("SELECT "+i+" AS idx, CAST(:lo"+i+" AS DATETIME) AS lo, CAST(:hi"+i+" AS DATETIME) AS hi");
            params.put("lo"+i,Rules.start(bucket.from()));
            params.put("hi"+i,Rules.start(bucket.to().plusDays(1)));
        }
        String query = "WITH periods AS (" + ranges + """
            ), sales_by_period AS (
              SELECT idx,SUM(total) revenue,SUM(cost_total) cost FROM periods
              JOIN sale_events ON occurred_at>=lo AND occurred_at<hi GROUP BY idx
            ), expenses_by_period AS (
              SELECT idx,SUM(total) expenses FROM periods
              JOIN expense_events ON occurred_at>=lo AND occurred_at<hi GROUP BY idx
            ), cash_by_period AS (
              SELECT idx,SUM(IF(direction='IN',amount,0)) received,SUM(IF(direction='OUT',amount,0)) paid
              FROM periods JOIN settlement_events ON occurred_at>=lo AND occurred_at<hi GROUP BY idx
            ), stock_by_period AS (
              SELECT idx,SUM(IF(type='LOSS',-value_delta,0)) losses,
                     SUM(IF(type='PURCHASE',quantity_delta,0)) purchased_kg,
                     SUM(IF(type='SALE',-quantity_delta,0)) sold_kg,
                     SUM(IF(type='LOSS',-quantity_delta,0)) lost_kg
              FROM periods JOIN stock_events ON occurred_at>=lo AND occurred_at<hi GROUP BY idx
            )
            SELECT p.idx,COALESCE(revenue,0) revenue,
                   COALESCE(revenue,0)-COALESCE(cost,0)-COALESCE(expenses,0)-COALESCE(losses,0) operating_result,
                   COALESCE(received,0) received,COALESCE(paid,0) paid,COALESCE(purchased_kg,0) purchased_kg,
                   COALESCE(sold_kg,0) sold_kg,COALESCE(lost_kg,0) lost_kg
            FROM periods p LEFT JOIN sales_by_period USING(idx) LEFT JOIN expenses_by_period USING(idx)
            LEFT JOIN cash_by_period USING(idx) LEFT JOIN stock_by_period USING(idx) ORDER BY p.idx
            """;
        return sql.all(query,params).map(row -> {
            Map<String,Object> point = new LinkedHashMap<>(row);
            var bucket = buckets.get(((Number)point.remove("idx")).intValue());
            point.put("from",bucket.from());
            point.put("to",bucket.to());
            return point;
        }).collectList();
    }
}

