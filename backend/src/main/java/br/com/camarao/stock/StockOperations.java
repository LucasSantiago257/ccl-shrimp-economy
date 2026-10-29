package br.com.camarao.stock;

import br.com.camarao.shared.*;
import br.com.camarao.closing.PeriodGuard;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class StockOperations {
    public record Loss(@Positive long productId,@NotNull @DecimalMin("0.001") @Digits(integer=10,fraction=3) BigDecimal quantity,
        @NotBlank @Size(max=250) String reason) {}
    private final Sql sql;
    private final StockService stock;
    private final Idempotency idempotency;
    private final PeriodGuard periods;
    public StockOperations(Sql sql,StockService stock,Idempotency idempotency,PeriodGuard periods) { this.sql=sql;this.stock=stock;this.idempotency=idempotency;this.periods=periods; }
    @Transactional
    public Mono<Map<String,Long>> loss(String key,Loss loss,String actor) {
        return idempotency.run(key,"LOSS",loss,actor,() -> periods.requireOpenDay().flatMap(now -> stock.consume(loss.productId(),loss.quantity()).flatMap(cost ->
            sql.insert("INSERT INTO stock_movements(product_id,type,quantity_delta,value_delta,reason,occurred_at,created_by) VALUES(:product,'LOSS',:quantity,:value,:reason,:at,:actor)",
                Map.of("product",loss.productId(),"quantity",loss.quantity().negate(),"value",cost.totalCost().negate(),"reason",loss.reason().trim(),"at",now,"actor",actor)))));
    }
    public Flux<Map<String,Object>> movements(long productId) {
        return sql.all("SELECT m.*,p.name AS product_name FROM stock_movements m JOIN products p ON p.id=m.product_id WHERE (:product=0 OR m.product_id=:product) ORDER BY m.id DESC LIMIT 300",Map.of("product",productId));
    }
}
