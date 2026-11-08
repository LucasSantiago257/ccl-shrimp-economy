package br.com.camarao.auth;

import java.security.Principal;
import java.util.Map;
import org.springframework.security.web.server.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AccountService accounts;
    private final AuthThrottle throttle;
    private final RememberedLoginService remembered;
    public AuthController(AccountService accounts,AuthThrottle throttle,RememberedLoginService remembered) { this.accounts=accounts;this.throttle=throttle;this.remembered=remembered; }
    public record Change(@jakarta.validation.constraints.NotBlank String currentPassword,@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max=72) String password,@jakarta.validation.constraints.NotBlank String confirmation) {}
    public record Reset(@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max=100) String token,@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(max=72) String password,@jakarta.validation.constraints.NotBlank String confirmation) {}
    @GetMapping("/profile") public Mono<Map<String,Object>> profile() { return accounts.profile(); }
    @PostMapping("/password")
    public Mono<Void> change(@jakarta.validation.Valid @RequestBody Change body,ServerWebExchange exchange) {
        throttle.check("change",10);
        return accounts.change(body.currentPassword(),body.password(),body.confirmation())
            .then(Mono.defer(()->remembered.revoke(exchange))).then(exchange.getSession().flatMap(session->session.invalidate()));
    }
    @PostMapping("/password/reset-request")
    public Mono<Map<String,String>> requestReset() {
        throttle.check("request",3);
        return accounts.requestReset().thenReturn(Map.of("message","Se houver recuperação configurada, as instruções serão enviadas ao e-mail cadastrado. Verifique também o spam."));
    }
    @PostMapping("/password/reset")
    public Mono<Void> reset(@jakarta.validation.Valid @RequestBody Reset body,ServerWebExchange exchange) {
        throttle.check("reset",10);
        return accounts.reset(body.token(),body.password(),body.confirmation())
            .then(Mono.defer(()->remembered.revoke(exchange))).then(exchange.getSession().flatMap(session->session.invalidate()));
    }
    @GetMapping("/csrf")
    public Mono<Map<String,String>> csrf(ServerWebExchange exchange) {
        Mono<CsrfToken> csrf = exchange.getAttribute(CsrfToken.class.getName());
        return csrf.map(t -> Map.of("token",t.getToken(),"header",t.getHeaderName()));
    }
    @GetMapping("/me")
    public Map<String,String> me(Principal principal) { return Map.of("username",principal.getName()); }
}
