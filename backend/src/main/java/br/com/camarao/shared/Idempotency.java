package br.com.camarao.shared;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

@Component
public class Idempotency {
    private final Sql sql;
    private final ObjectMapper mapper;
    public Idempotency(Sql sql,ObjectMapper mapper) { this.sql=sql; this.mapper=mapper; }
    // The caller owns the transaction. The request row is locked until all side effects commit.
    public Mono<Map<String,Long>> run(String key,String type,Object payload,String actor,Supplier<Mono<Long>> operation) {
        Rules.require(key != null && key.matches("[A-Za-z0-9_-]{16,64}"),"Envie um Idempotency-Key de 16 a 64 caracteres.");
        final String hash;
        try { hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(mapper.writeValueAsString(payload).getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { return Mono.error(new IllegalArgumentException("Falha ao identificar a operação.",e)); }
        var params=Map.of("key",key,"type",type,"hash",hash,"actor",actor);
        return sql.update("INSERT INTO operation_requests(request_key,operation_type,request_hash,created_by) VALUES(:key,:type,:hash,:actor) ON DUPLICATE KEY UPDATE request_key=request_key",params)
            .then(sql.one("SELECT * FROM operation_requests WHERE request_key=:key FOR UPDATE",Map.of("key",key)))
            .flatMap(row -> {
                if (!type.equals(row.get("operation_type")) || !hash.equals(row.get("request_hash")) || !actor.equals(row.get("created_by")))
                    return Mono.error(Rules.conflict("Esta chave já foi usada para outra operação."));
                if(row.get("result_id") != null) return Mono.just(Map.of("id",Sql.id(row,"result_id")));
                return Mono.defer(operation).flatMap(id -> sql.update("UPDATE operation_requests SET result_id=:id WHERE request_key=:key",Map.of("id",id,"key",key)).thenReturn(Map.of("id",id)));
            });
    }
}
