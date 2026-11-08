package br.com.camarao.auth;

import br.com.camarao.closing.ClosingService;
import br.com.camarao.shared.Sql;
import java.net.URI;
import java.security.SecureRandom;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.*;
import org.springframework.stereotype.Service;
import org.springframework.web.server.*;
import reactor.core.publisher.Mono;

@Service
public class RememberedLoginService {
    static final String COOKIE="MARE_REMEMBER";
    static final Duration LIFETIME=Duration.ofDays(30);
    private final Sql sql;
    private final Clock clock;
    private final boolean secure;
    private final SecureRandom random=new SecureRandom();
    public RememberedLoginService(Sql sql,Clock clock,@Value("${app.public-url}") String publicUrl) {
        this.sql=sql;this.clock=clock;this.secure="https".equalsIgnoreCase(URI.create(publicUrl).getScheme());
    }
    private LocalDateTime now() { return LocalDateTime.ofInstant(clock.instant(),ZoneOffset.UTC); }
    private String token(ServerWebExchange exchange) {
        var cookie=exchange.getRequest().getCookies().getFirst(COOKIE);
        return cookie!=null && cookie.getValue().matches("[A-Za-z0-9_-]{43}") ? cookie.getValue() : null;
    }
    private void cookie(ServerWebExchange exchange,String value,Duration age) {
        exchange.getResponse().getCookies().set(COOKIE,ResponseCookie.from(COOKIE,value).httpOnly(true)
            .secure(secure || exchange.getRequest().getSslInfo()!=null).sameSite("Lax").path("/api").maxAge(age).build());
    }
    public Mono<Void> revoke(ServerWebExchange exchange) {
        String value=token(exchange);
        cookie(exchange,"",Duration.ZERO);
        return value==null ? Mono.empty() : sql.update("DELETE FROM remembered_logins WHERE token_hash=:hash",
            Map.of("hash",ClosingService.sha256(value))).then();
    }
    public Mono<Void> onLogin(ServerWebExchange exchange,AccountUser user) {
        return exchange.getFormData().flatMap(form->revoke(exchange).then(Mono.defer(()->{
            if(!"true".equals(form.getFirst("remember"))) return Mono.empty();
            byte[] bytes=new byte[32];random.nextBytes(bytes);
            String value=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            return sql.update("DELETE FROM remembered_logins WHERE expires_at<=:now OR account_version<>:version",
                    Map.of("now",now(),"version",user.version()))
                .then(sql.update("INSERT INTO remembered_logins(token_hash,account_version,expires_at) VALUES(:hash,:version,:expires)",
                    Map.of("hash",ClosingService.sha256(value),"version",user.version(),"expires",now().plus(LIFETIME))))
                .doOnSuccess(ignored->cookie(exchange,value,LIFETIME)).then();
        })));
    }
    public Mono<Void> filter(ServerWebExchange exchange,WebFilterChain chain) {
        // Form login always requires the submitted password, even on a remembered device.
        if(exchange.getRequest().getPath().value().equals("/api/login")) return chain.filter(exchange);
        return ReactiveSecurityContextHolder.getContext().map(c->c.getAuthentication()!=null && c.getAuthentication().isAuthenticated())
            .defaultIfEmpty(false).flatMap(authenticated->{
                if(authenticated) return chain.filter(exchange);
                String value=token(exchange);
                if(value==null) return chain.filter(exchange);
                return sql.one("SELECT a.* FROM app_account a JOIN remembered_logins r ON r.account_version=a.version WHERE a.id=1 AND r.token_hash=:hash AND r.expires_at>:now",
                        Map.of("hash",ClosingService.sha256(value),"now",now()))
                    .map(a->new AccountUser((String)a.get("username"),(String)a.get("password_hash"),Sql.id(a,"version")))
                    .map(user->(SecurityContext)new SecurityContextImpl(UsernamePasswordAuthenticationToken.authenticated(user,null,user.getAuthorities())))
                    .map(Optional::of).defaultIfEmpty(Optional.empty()).flatMap(context->{
                        if(context.isEmpty()) { cookie(exchange,"",Duration.ZERO);return chain.filter(exchange); }
                        // Authenticate this request only; every remembered request checks expiry and revocation.
                        return chain.filter(exchange).contextWrite(ReactiveSecurityContextHolder.withSecurityContext(Mono.just(context.get())));
                    });
            });
    }
}
