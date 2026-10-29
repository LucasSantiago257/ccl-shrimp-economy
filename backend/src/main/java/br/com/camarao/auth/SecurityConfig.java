package br.com.camarao.auth;

import org.springframework.beans.factory.annotation.Value;
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
    MapReactiveUserDetailsService users(@Value("${app.username}") String username, @Value("${app.password}") String password) {
        if (password.length() < 12) throw new IllegalArgumentException("APP_ADMIN_PASSWORD deve ter no mínimo 12 caracteres.");
        return new MapReactiveUserDetailsService(User.withUsername(username)
            .password("{bcrypt}"+new BCryptPasswordEncoder().encode(password)).roles("ADMIN").build());
    }
    @Bean
    SecurityWebFilterChain security(ServerHttpSecurity http) {
        return http.authorizeExchange(a -> a.pathMatchers("/api/auth/csrf","/api/login").permitAll().anyExchange().authenticated())
            .exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusServerEntryPoint(HttpStatus.UNAUTHORIZED)))
            .formLogin(f -> f.loginPage("/api/login")
                .authenticationSuccessHandler((filter,auth) -> {
                    filter.getExchange().getResponse().setStatusCode(HttpStatus.NO_CONTENT);
                    return filter.getExchange().getResponse().setComplete();
                })
                .authenticationFailureHandler((filter,error) -> {
                    filter.getExchange().getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
                    return filter.getExchange().getResponse().setComplete();
                }))
            .logout(l -> l.logoutUrl("/api/logout").logoutSuccessHandler(new HttpStatusReturningServerLogoutSuccessHandler(HttpStatus.NO_CONTENT)))
            .build();
    }
}
