package br.com.camarao.auth;

import br.com.camarao.closing.ClosingService;
import br.com.camarao.shared.Sql;
import java.time.Clock;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.server.*;
import reactor.core.publisher.Mono;

@Component
public class LoginThrottle {
    private final Sql sql;
    private final Clock clock;
    private final boolean trustProxy;
    public LoginThrottle(Sql sql,Clock clock,@Value("${app.trust-login-proxy:false}") boolean trustProxy) {
        this.sql=sql;this.clock=clock;this.trustProxy=trustProxy;
    }
    String source(ServerWebExchange exchange) {
        // Enable only when the backend is reachable solely through a proxy that overwrites X-Real-IP.
        String forwarded=exchange.getRequest().getHeaders().getFirst("X-Real-IP");
        if(trustProxy && forwarded!=null && forwarded.matches("[0-9a-fA-F:.]{3,45}")) return forwarded;
        var remote=exchange.getRequest().getRemoteAddress();
        return remote==null ? "unknown" : remote.getAddress()==null ? remote.getHostString() : remote.getAddress().getHostAddress();
    }
    Mono<Boolean> allow(ServerWebExchange exchange) {
        return Mono.defer(()->{
            var params=Map.of("source",ClosingService.sha256(source(exchange)),"window",clock.instant().getEpochSecond()/60);
            // Autocommitted atomic increment is shared by all instances and survives restarts.
            // Concurrent readers may reject conservatively, but can never lose increments.
            return sql.update("INSERT INTO login_attempt_windows(source_hash,window_start,attempts) VALUES(:source,:window,1) ON DUPLICATE KEY UPDATE attempts=LEAST(attempts+1,1000000)",params)
                .then(sql.one("SELECT attempts FROM login_attempt_windows WHERE source_hash=:source AND window_start=:window",params))
                .map(row->Sql.id(row,"attempts")<=20).defaultIfEmpty(false);
        });
    }
    public Mono<Void> filter(ServerWebExchange exchange,WebFilterChain chain) {
        if(exchange.getRequest().getMethod()!=HttpMethod.POST || !exchange.getRequest().getPath().value().equals("/api/login")) return chain.filter(exchange);
        return allow(exchange).flatMap(allowed->{
            if(allowed) return chain.filter(exchange);
            exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
            exchange.getResponse().getHeaders().set(HttpHeaders.RETRY_AFTER,Long.toString(60-clock.instant().getEpochSecond()%60));
            exchange.getResponse().getHeaders().setCacheControl("no-store");
            return exchange.getResponse().setComplete();
        });
    }
    @Scheduled(fixedDelay=3600000,initialDelay=3600000)
    public Mono<Void> removeOldWindows() {
        return Mono.defer(()->sql.update("DELETE FROM login_attempt_windows WHERE window_start<:cutoff",
            Map.of("cutoff",clock.instant().getEpochSecond()/60-120))).then();
    }
}
