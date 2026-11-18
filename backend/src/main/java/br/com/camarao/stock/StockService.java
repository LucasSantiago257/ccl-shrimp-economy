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
    public record Consumption(BigDecimal unitCost,BigDecimal totalCost,long lotId) {}
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
        return new Consumption(unit,cost,0);
    }
    public Mono<Consumption> consume(long productId,BigDecimal quantity,Long lotId) {
        return lock(productId).flatMap(row -> {
            BigDecimal available=Sql.decimal(row,"quantity"), value=Sql.decimal(row,"stock_value");
            return sql.all("SELECT * FROM stock_lots WHERE product_id=:product AND quantity>0 AND (:lot=0 OR id=:lot) ORDER BY received_at,id LIMIT 1 FOR UPDATE",
                Map.of("product",productId,"lot",lotId==null?0:lotId)).next()
                .switchIfEmpty(Mono.error(Rules.conflict("Lote indisponível para este produto."))).flatMap(lot -> {
                    if(Sql.decimal(lot,"quantity").compareTo(quantity)<0) throw Rules.conflict("Saldo insuficiente no lote selecionado. Na venda, adicione outro item para usar um segundo lote.");
                    var cost=calculate(Sql.decimal(lot,"quantity"),Sql.decimal(lot,"stock_value"),quantity);
                    BigDecimal remaining=available.subtract(quantity), remainingValue=value.subtract(cost.totalCost());
                    BigDecimal average=remaining.signum()==0 ? BigDecimal.ZERO : remainingValue.divide(remaining,6,RoundingMode.HALF_UP);
                    return sql.update("UPDATE stock_balances SET quantity=:quantity,stock_value=:value,average_cost=:average WHERE product_id=:id",
                        Map.of("quantity",remaining,"value",remainingValue,"average",average,"id",productId)).thenReturn(new Consumption(cost.unitCost(),cost.totalCost(),Sql.id(lot,"id")));
            });
        });
    }
    public Mono<Long> createLot(long product,String origin,long document,LocalDateTime now,BigDecimal price) {
        var params=new java.util.HashMap<String,Object>(Map.of("p",product,"origin",origin,"doc",document,"at",now));
        params.put("price",price);
        return sql.insert("INSERT INTO stock_lots(product_id,origin,origin_id,received_at,suggested_price) SELECT id,:origin,:doc,:at,COALESCE(:price,suggested_price) FROM products WHERE id=:p",params);
    }
    public Mono<Void> movement(long productId,String type,BigDecimal quantity,BigDecimal value,long itemId,long lotId,LocalDateTime now,String actor) {
        String item=type.equals("PURCHASE") ? "purchase_item_id" : "sale_item_id";
        return sql.update("INSERT INTO stock_movements(product_id,type,quantity_delta,value_delta,"+item+",lot_id,occurred_at,created_by) VALUES(:product,:type,:quantity,:value,:item,:lot,:at,:actor)",
            Map.of("product",productId,"type",type,"quantity",quantity,"value",value,"item",itemId,"lot",lotId,"at",now,"actor",actor)).then();
    }
}
