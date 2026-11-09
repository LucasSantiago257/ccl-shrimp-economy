package br.com.camarao.auth;

import org.springframework.context.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.server.SecurityWebFilterChain;
import org.springframework.security.web.server.authentication.*;
import org.springframework.security.web.server.authentication.logout.HttpStatusReturningServerLogoutSuccessHandler;

@Configuration
public class SecurityConfig {
    @Bean
    ReactiveUserDetailsService users(AccountService accounts) { return accounts::find; }
    @Bean
    SecurityWebFilterChain security(ServerHttpSecurity http,AccountService accounts,LoginThrottle throttle,RememberedLoginService remembered) {
        http.addFilterBefore(remembered::filter,org.springframework.security.config.web.server.SecurityWebFiltersOrder.AUTHENTICATION);
        http.addFilterBefore(throttle::filter,org.springframework.security.config.web.server.SecurityWebFiltersOrder.FORM_LOGIN);
        http.addFilterAfter((exchange,chain)->
            org.springframework.security.core.context.ReactiveSecurityContextHolder.getContext()
                .filter(c->c.getAuthentication()!=null && c.getAuthentication().isAuthenticated())
                .flatMap(c->accounts.account().map(a->c.getAuthentication().getPrincipal() instanceof AccountUser user &&
                    user.version()==br.com.camarao.shared.Sql.id(a,"version") && user.getUsername().equals(a.get("username"))))
                .defaultIfEmpty(true).flatMap(valid->{
                    if(valid) return chain.filter(exchange);
                    return exchange.getSession().flatMap(session->session.invalidate()).then(reactor.core.publisher.Mono.defer(()->{
                        exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                        return exchange.getResponse().setComplete();
                    }));
                }),org.springframework.security.config.web.server.SecurityWebFiltersOrder.AUTHENTICATION);
        return http.authorizeExchange(a -> a.pathMatchers("/api/auth/csrf","/api/login","/api/auth/password/reset-request","/api/auth/password/reset").permitAll().anyExchange().authenticated())
            .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusServerEntryPoint(HttpStatus.UNAUTHORIZED)))
            .formLogin(f -> f.loginPage("/api/login")
                .authenticationSuccessHandler((filter,auth) -> {
                    filter.getExchange().getResponse().setStatusCode(HttpStatus.NO_CONTENT);
                    return remembered.onLogin(filter.getExchange(),(AccountUser)auth.getPrincipal())
                        .then(reactor.core.publisher.Mono.defer(()->filter.getExchange().getResponse().setComplete()));
                })
                .authenticationFailureHandler((filter,error) -> {
                    filter.getExchange().getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                    return filter.getExchange().getResponse().setComplete();
                }))
            .logout(l -> l.logoutUrl("/api/logout").logoutHandler(new org.springframework.security.web.server.authentication.logout.DelegatingServerLogoutHandler(
                (exchange,auth)->remembered.revoke(exchange.getExchange()),
                new org.springframework.security.web.server.authentication.logout.SecurityContextServerLogoutHandler(),
                new org.springframework.security.web.server.authentication.logout.WebSessionServerLogoutHandler()))
                .logoutSuccessHandler(new HttpStatusReturningServerLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
            .build();
    }
}
