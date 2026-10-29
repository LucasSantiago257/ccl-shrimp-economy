package br.com.camarao.stock;

import br.com.camarao.shared.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.Map;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

@Service
public class StockService {
    public record Consumption(BigDecimal unitCost,BigDecimal totalCost) {}
    private final Sql sql;
    public StockService(Sql sql) { this.sql=sql; }
    private Mono<Map<String,Object>> lock(long productId) {
        return sql.one("SELECT s.*,p.active FROM stock_balances s JOIN products p ON p.id=s.product_id WHERE s.product_id=:id FOR UPDATE",Map.of("id",productId))
            .switchIfEmpty(Mono.error(Rules.missing("Produto não encontrado.")))
            .doOnNext(row -> Rules.require(Sql.active(row),"Produto inativo."));
    }
    public Mono<Void> receive(long productId,BigDecimal quantity,BigDecimal cost) {
        return lock(productId).flatMap(row -> {
            BigDecimal newQuantity=Sql.decimal(row,"quantity").add(quantity);
            BigDecimal newValue=Sql.decimal(row,"stock_value").add(cost);
            return sql.update("UPDATE stock_balances SET quantity=:quantity,stock_value=:value,average_cost=:average WHERE product_id=:id",
                Map.of("quantity",newQuantity,"value",newValue,"average",newValue.divide(newQuantity,6,RoundingMode.HALF_UP),"id",productId));
        }).then();
    }
    public static Consumption calculate(BigDecimal available,BigDecimal value,BigDecimal quantity) {
        Rules.require(quantity.signum()>0,"A quantidade deve ser positiva.");
        if(available.compareTo(quantity)<0) throw Rules.conflict("Estoque insuficiente para a quantidade solicitada.");
        BigDecimal unit=value.divide(available,6,RoundingMode.HALF_UP);
        BigDecimal cost=available.compareTo(quantity)==0 ? value : value.multiply(quantity).divide(available,6,RoundingMode.HALF_UP);
        return new Consumption(unit,cost);
    }
    public Mono<Consumption> consume(long productId,BigDecimal quantity) {
        return lock(productId).flatMap(row -> {
            BigDecimal available=Sql.decimal(row,"quantity"), value=Sql.decimal(row,"stock_value");
            var cost=calculate(available,value,quantity);
            BigDecimal remaining=available.subtract(quantity), remainingValue=value.subtract(cost.totalCost());
            BigDecimal average=remaining.signum()==0 ? BigDecimal.ZERO : remainingValue.divide(remaining,6,RoundingMode.HALF_UP);
            return sql.update("UPDATE stock_balances SET quantity=:quantity,stock_value=:value,average_cost=:average WHERE product_id=:id",
                Map.of("quantity",remaining,"value",remainingValue,"average",average,"id",productId)).thenReturn(cost);
        });
    }
    public Mono<Void> movement(long productId,String type,BigDecimal quantity,BigDecimal value,long itemId,LocalDateTime now,String actor) {
        String item=type.equals("PURCHASE") ? "purchase_item_id" : "sale_item_id";
        return sql.update("INSERT INTO stock_movements(product_id,type,quantity_delta,value_delta,"+item+",occurred_at,created_by) VALUES(:product,:type,:quantity,:value,:item,:at,:actor)",
            Map.of("product",productId,"type",type,"quantity",quantity,"value",value,"item",itemId,"at",now,"actor",actor)).then();
    }
}
