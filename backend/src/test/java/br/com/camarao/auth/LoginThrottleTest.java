package br.com.camarao.auth;

import br.com.camarao.shared.Sql;
import java.net.InetSocketAddress;
import java.time.*;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class LoginThrottleTest {
    private final Clock clock=Clock.fixed(Instant.parse("2026-11-08T12:00:00Z"),ZoneOffset.UTC);
    @Test void acceptsTwentiethAttemptAndRejectsTwentyFirst() {
        var sql=mock(Sql.class);when(sql.update(anyString(),anyMap())).thenReturn(Mono.just(1L));
        when(sql.one(anyString(),anyMap())).thenReturn(Mono.just(Map.of("attempts",20L)),Mono.just(Map.of("attempts",21L)));
        var throttle=new LoginThrottle(sql,clock,false);
        var exchange=MockServerWebExchange.from(MockServerHttpRequest.post("/api/login"));
        assertEquals(true,throttle.allow(exchange).block(Duration.ofSeconds(5)));
        assertEquals(false,throttle.allow(exchange).block(Duration.ofSeconds(5)));
    }
    @Test void ignoresSpoofedForwardingHeadersUnlessProxyIsExplicitlyTrusted() {
        var request=MockServerWebExchange.from(MockServerHttpRequest.post("/api/login")
            .remoteAddress(new InetSocketAddress("127.0.0.1",50000)).header("X-Real-IP","198.51.100.7").header("X-Forwarded-For","192.0.2.9"));
        assertEquals("127.0.0.1",new LoginThrottle(mock(Sql.class),clock,false).source(request));
        assertEquals("198.51.100.7",new LoginThrottle(mock(Sql.class),clock,true).source(request));
    }
}
