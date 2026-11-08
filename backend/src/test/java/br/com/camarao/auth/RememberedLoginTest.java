package br.com.camarao.auth;

import br.com.camarao.closing.ClosingService;
import br.com.camarao.shared.Sql;
import java.time.*;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import reactor.core.publisher.Mono;

class RememberedLoginTest {
    private final Clock clock=Clock.fixed(Instant.parse("2026-11-08T12:00:00Z"),ZoneOffset.UTC);
    @Test void secureCookieAndHashedExpiringToken() {
        Sql sql=mock(Sql.class);
        when(sql.update(anyString(),anyMap())).thenReturn(Mono.just(1L));
        var exchange=MockServerWebExchange.from(MockServerHttpRequest.post("/api/login")
            .contentType(MediaType.APPLICATION_FORM_URLENCODED).body("remember=true"));
        new RememberedLoginService(sql,clock,"https://mare.example.test").onLogin(exchange,new AccountUser("owner","unused",7)).block(Duration.ofSeconds(10));
        var cookie=exchange.getResponse().getCookies().getFirst(RememberedLoginService.COOKIE);
        assertNotNull(cookie);
        assertTrue(cookie.isHttpOnly());assertTrue(cookie.isSecure());assertEquals("Lax",cookie.getSameSite());
        assertEquals("/api",cookie.getPath());assertEquals(Duration.ofDays(30),cookie.getMaxAge());
        assertTrue(cookie.getValue().matches("[A-Za-z0-9_-]{43}"));
        verify(sql).update(startsWith("INSERT"),eq(Map.of("hash",ClosingService.sha256(cookie.getValue()),"version",7L,
            "expires",LocalDateTime.ofInstant(clock.instant(),ZoneOffset.UTC).plusDays(30))));
    }
    @Test void uncheckedLoginRevokesExistingDeviceInsteadOfIssuingAnotherToken() {
        Sql sql=mock(Sql.class);when(sql.update(anyString(),anyMap())).thenReturn(Mono.just(1L));
        String token="x".repeat(43);
        var exchange=MockServerWebExchange.from(MockServerHttpRequest.post("/api/login")
            .cookie(new org.springframework.http.HttpCookie(RememberedLoginService.COOKIE,token))
            .contentType(MediaType.APPLICATION_FORM_URLENCODED).body("remember=false"));
        new RememberedLoginService(sql,clock,"http://localhost:5173").onLogin(exchange,new AccountUser("owner","unused",7)).block(Duration.ofSeconds(10));
        var cookie=exchange.getResponse().getCookies().getFirst(RememberedLoginService.COOKIE);
        assertNotNull(cookie);assertEquals(Duration.ZERO,cookie.getMaxAge());assertFalse(cookie.isSecure());
        verify(sql).update(startsWith("DELETE"),eq(Map.of("hash",ClosingService.sha256(token))));
        verify(sql,never()).update(startsWith("INSERT"),anyMap());
    }
}
