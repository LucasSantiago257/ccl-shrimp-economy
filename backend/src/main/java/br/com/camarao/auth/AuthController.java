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
    @GetMapping("/csrf")
    public Mono<Map<String,String>> csrf(ServerWebExchange exchange) {
        Mono<CsrfToken> csrf = exchange.getAttribute(CsrfToken.class.getName());
        return csrf.map(t -> Map.of("token",t.getToken(),"header",t.getHeaderName()));
    }
    @GetMapping("/me")
    public Map<String,String> me(Principal principal) { return Map.of("username",principal.getName()); }
}
