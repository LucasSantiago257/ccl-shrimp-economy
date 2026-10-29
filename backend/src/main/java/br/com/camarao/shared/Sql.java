package br.com.camarao.shared;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.math.BigDecimal;
import java.util.Map;

@Component
public class Sql {
    private final DatabaseClient db;
    public Sql(DatabaseClient db) { this.db = db; }
    private DatabaseClient.GenericExecuteSpec query(String sql, Map<String, ?> params) {
        var spec = db.sql(sql);
        for (var entry : params.entrySet()) spec = entry.getValue()==null
            ? spec.bindNull(entry.getKey(),Long.class) : spec.bind(entry.getKey(),entry.getValue());
        return spec;
    }
    public Flux<Map<String,Object>> all(String sql, Map<String,?> p) { return query(sql,p).fetch().all(); }
    public Mono<Map<String,Object>> one(String sql, Map<String,?> p) { return query(sql,p).fetch().one(); }
    public Mono<Long> update(String sql, Map<String,?> p) { return query(sql,p).fetch().rowsUpdated(); }
    // Called only inside a reactive transaction: both statements use its bound connection.
    public Mono<Long> insert(String sql, Map<String,?> p) {
        return update(sql,p).then(Mono.defer(() -> one("SELECT LAST_INSERT_ID() AS id",Map.of())))
            .map(row -> id(row,"id"));
    }
    public static long id(Map<String,Object> row, String field) { return ((Number)row.get(field)).longValue(); }
    public static BigDecimal decimal(Map<String,Object> row, String field) {
        Object value = row.get(field);
        return value == null ? BigDecimal.ZERO : new BigDecimal(value.toString());
    }
    public static boolean active(Map<String,Object> row) {
        Object value = row.get("active");
        return Boolean.TRUE.equals(value) || (value instanceof Number n && n.intValue() == 1);
    }
}
