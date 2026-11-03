package br.com.camarao.shared;

import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import java.math.BigDecimal;
import java.util.Map;
import java.util.List;
import java.util.HashMap;
import java.util.LinkedHashMap;
import org.springframework.transaction.annotation.Transactional;

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
    @Transactional(readOnly=true)
    public Mono<PageResult> page(String select,String order,Map<String,?> params,PageQuery request,String... sums) {
        String aggregates="COUNT(*) AS total";
        for(String field:sums) {
            if(!field.matches("[a-z_]+")) throw new IllegalArgumentException("Agregação inválida.");
            aggregates+=",COALESCE(SUM("+field+"),0) AS sum_"+field;
        }
        return one("SELECT "+aggregates+" FROM ("+select+") page_count",params).flatMap(count -> {
            long total=id(count,"total"), pages=total/request.size()+(total%request.size()==0?0:1);
            var summary=new LinkedHashMap<String,Object>();
            for(String field:sums) summary.put(field,count.get("sum_"+field));
            var bound=new HashMap<String,Object>(params); bound.put("_size",request.size()); bound.put("_offset",request.offset());
            return all(select+" ORDER BY "+order+" LIMIT :_size OFFSET :_offset",bound).collectList()
                .map(rows -> new PageResult(rows,request.page(),request.size(),total,pages,request.page()<pages,request.page()>1&&pages>0,summary));
        });
    }
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
