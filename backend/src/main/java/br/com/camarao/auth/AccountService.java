package br.com.camarao.auth;

import br.com.camarao.shared.*;
import br.com.camarao.closing.ClosingService;
import java.time.*;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Service;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AccountService implements ApplicationRunner {
    private final Sql sql;
    private final Clock clock;
    private final ResetMailer mail;
    private final String username;
    private final String initialPassword;
    private final String fallback;
    private final BCryptPasswordEncoder encoder=new BCryptPasswordEncoder();
    public AccountService(Sql sql,Clock clock,ResetMailer mail,@Value("${app.username}") String username,
        @Value("${app.password}") String password,@Value("${app.fallback-mail:}") String fallback) {
        this.sql=sql;this.clock=clock;this.mail=mail;this.username=username;this.initialPassword=password;this.fallback=fallback;
    }
    private LocalDateTime now() { return LocalDateTime.ofInstant(clock.instant(),ZoneOffset.UTC); }
    public Mono<Map<String,Object>> account() { return sql.one("SELECT * FROM app_account WHERE id=1",Map.of()); }
    @Override public void run(ApplicationArguments args) {
        Rules.require(!username.isBlank() && username.length()<=100,"Configure um usuário de até 100 caracteres.");
        // Startup-only bootstrap. Password changes are owned by the database after this point.
        var existing=account().block();
        if(existing==null) {
            validate(initialPassword);
            sql.update("INSERT IGNORE INTO app_account(id,username,password_hash) VALUES(1,:username,:hash)",
                Map.of("username",username,"hash","{bcrypt}"+encoder.encode(initialPassword))).block();
        }
        sql.update("UPDATE app_account SET username=:username,version=version+1,reset_hash=NULL,reset_expires=NULL WHERE id=1 AND CAST(username AS BINARY)<>CAST(:username AS BINARY)",Map.of("username",username)).block();
    }
    public Mono<UserDetails> find(String name) {
        return account().filter(a->name.equals(a.get("username")))
            .map(a->new AccountUser((String)a.get("username"),(String)a.get("password_hash"),Sql.id(a,"version")));
    }
    public Mono<Map<String,Object>> profile() {
        return account().map(a->Map.of("username",a.get("username"),"recoveryEmail",fallback,
            "recoveryConfigured",!fallback.isBlank() && mail.configured()));
    }
    private static void validate(String value) {
        Rules.require(value!=null && value.length()>=12 && value.getBytes(StandardCharsets.UTF_8).length<=72,"Use pelo menos 12 caracteres e no máximo 72 bytes na senha.");
    }
    private Mono<String> hash(String value) {
        validate(value);
        return Mono.fromCallable(()->"{bcrypt}"+encoder.encode(value)).subscribeOn(Schedulers.boundedElastic());
    }
    private Mono<Long> store(String hash) {
        return sql.update("UPDATE app_account SET password_hash=:hash,version=version+1,reset_hash=NULL,reset_expires=NULL WHERE id=1",Map.of("hash",hash));
    }
    @Transactional
    public Mono<Void> change(String current,String password,String confirmation) {
        Rules.require(password.equals(confirmation),"A confirmação da senha não confere.");
        return hash(password).flatMap(hash->sql.one("SELECT * FROM app_account WHERE id=1 FOR UPDATE",Map.of())
            .flatMap(a->Mono.fromCallable(()->encoder.matches(current,((String)a.get("password_hash")).substring(8))).subscribeOn(Schedulers.boundedElastic())
                .flatMap(matches->{ Rules.require(matches,"Senha atual incorreta.");return store(hash); }))).then();
    }
    @Transactional
    public Mono<Void> requestReset() {
        if(fallback.isBlank() || !mail.configured()) return Mono.error(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"A recuperação por e-mail ainda não está configurada."));
        return sql.one("SELECT * FROM app_account WHERE id=1 FOR UPDATE",Map.of()).flatMap(a->{
            LocalDateTime now=now();
            if(a.get("reset_hash")!=null && a.get("reset_expires") instanceof LocalDateTime expires && expires.isAfter(now)) return Mono.empty();
            if(a.get("reset_sent_at") instanceof LocalDateTime sent && sent.plusMinutes(1).isAfter(now)) return Mono.empty();
            byte[] bytes=new byte[32];new SecureRandom().nextBytes(bytes);
            String token=Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            return sql.update("UPDATE app_account SET reset_hash=:hash,reset_expires=:expires,reset_sent_at=:at WHERE id=1",
                Map.of("hash",ClosingService.sha256(token),"expires",now.plusMinutes(30),"at",now))
                .then(Mono.fromRunnable(()->mail.send(fallback,token)).subscribeOn(Schedulers.boundedElastic()))
                .onErrorMap(org.springframework.mail.MailException.class,e->new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Não foi possível enviar o e-mail. Tente novamente mais tarde."));
        }).then();
    }
    @Transactional
    public Mono<Void> reset(String token,String password,String confirmation) {
        Rules.require(password.equals(confirmation),"A confirmação da senha não confere.");
        return hash(password).flatMap(hash->sql.one("SELECT * FROM app_account WHERE id=1 FOR UPDATE",Map.of()).flatMap(a->{
            boolean valid=token.matches("[A-Za-z0-9_-]{43}") && ClosingService.sha256(token).equals(a.get("reset_hash"))
                && a.get("reset_expires") instanceof LocalDateTime expires && expires.isAfter(now());
            Rules.require(valid,"O link é inválido ou expirou. Solicite outro link.");
            return store(hash);
        })).then();
    }
}

