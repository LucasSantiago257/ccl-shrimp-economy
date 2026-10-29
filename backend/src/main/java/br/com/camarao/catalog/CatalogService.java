package br.com.camarao.catalog;

import br.com.camarao.shared.*;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class CatalogService {
    public record Partner(@NotBlank @Size(max=160) String name, @NotNull @Size(max=30) String phone,
        @NotNull @Size(max=30) String document, @NotNull @Size(max=1000) String notes, @NotNull Boolean active) {}
    public record Product(@NotBlank @Size(max=40) String code, @NotBlank @Size(max=160) String name,
        @NotNull @DecimalMin("0.000001") @Digits(integer=12,fraction=6) BigDecimal suggestedPrice,
        @NotNull @DecimalMin("0") @Digits(integer=10,fraction=3) BigDecimal minimumStock, @NotNull Boolean active) {}
    private final Sql sql;
    public CatalogService(Sql sql) { this.sql = sql; }
    private String table(boolean customer) { return customer ? "customers" : "suppliers"; }
    public Flux<Map<String,Object>> partners(boolean customer, String q) {
        String field = customer ? "customer_id" : "supplier_id";
        return sql.all("SELECT p.*, COALESCE((SELECT SUM(t.amount-COALESCE(a.paid,0)) FROM financial_titles t "
            + "LEFT JOIN (SELECT title_id,SUM(amount) paid FROM settlement_allocations GROUP BY title_id) a ON a.title_id=t.id "
            + "WHERE t."+field+"=p.id),0) AS balance FROM "+table(customer)+" p WHERE p.name LIKE :q ORDER BY p.name LIMIT 200",Map.of("q","%"+q+"%"));
    }
    @Transactional
    public Mono<Map<String,Long>> createPartner(boolean customer, Partner p) {
        return sql.insert("INSERT INTO "+table(customer)+"(name,phone,document,notes,active) VALUES(:name,:phone,:document,:notes,:active)",partnerParams(p))
            .map(id -> Map.of("id",id));
    }
    @Transactional
    public Mono<Void> editPartner(boolean customer, long id, Partner p) {
        return sql.one("SELECT id FROM "+table(customer)+" WHERE id=:id FOR UPDATE",Map.of("id",id))
            .switchIfEmpty(Mono.error(Rules.missing("Cadastro não encontrado.")))
            .flatMap(row -> {
                var params = new java.util.HashMap<String,Object>(partnerParams(p)); params.put("id",id);
                return sql.update("UPDATE "+table(customer)+" SET name=:name,phone=:phone,document=:document,notes=:notes,active=:active WHERE id=:id",params);
            }).then();
    }
    private Map<String,Object> partnerParams(Partner p) {
        return Map.of("name",p.name().trim(),"phone",p.phone().trim(),"document",p.document().trim(),"notes",p.notes().trim(),"active",p.active());
    }
    public Flux<Map<String,Object>> products() {
        return sql.all("SELECT p.*,s.quantity,s.stock_value,s.average_cost FROM products p JOIN stock_balances s ON s.product_id=p.id ORDER BY p.name LIMIT 200",Map.of());
    }
    @Transactional
    public Mono<Map<String,Long>> createProduct(Product p) {
        return sql.insert("INSERT INTO products(code,name,suggested_price,minimum_stock,active) VALUES(:code,:name,:price,:minimum,:active)",productParams(p))
            .flatMap(id -> sql.update("INSERT INTO stock_balances(product_id) VALUES(:id)",Map.of("id",id)).thenReturn(Map.of("id",id)));
    }
    @Transactional
    public Mono<Void> editProduct(long id, Product p) {
        return sql.one("SELECT id FROM products WHERE id=:id FOR UPDATE",Map.of("id",id))
            .switchIfEmpty(Mono.error(Rules.missing("Produto não encontrado.")))
            .flatMap(row -> {
                var params = new java.util.HashMap<String,Object>(productParams(p)); params.put("id",id);
                return sql.update("UPDATE products SET code=:code,name=:name,suggested_price=:price,minimum_stock=:minimum,active=:active WHERE id=:id",params);
            }).then();
    }
    private Map<String,Object> productParams(Product p) {
        return Map.of("code",p.code().trim(),"name",p.name().trim(),"price",p.suggestedPrice(),"minimum",p.minimumStock(),"active",p.active());
    }
    public Mono<Void> requireActivePartner(boolean customer, long id) {
        return sql.one("SELECT * FROM "+table(customer)+" WHERE id=:id FOR SHARE",Map.of("id",id))
            .switchIfEmpty(Mono.error(Rules.missing("Cliente ou fornecedor não encontrado.")))
            .doOnNext(p -> Rules.require(Sql.active(p),"O cadastro está inativo.")).then();
    }
}
