package br.com.camarao.admin;

import br.com.camarao.closing.PeriodGuard;
import br.com.camarao.shared.*;
import java.sql.*;
import java.util.Map;
import java.util.concurrent.atomic.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.*;
import org.springframework.http.HttpStatus;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

@Component
public class HomologationReset implements WebFilter {
    final AtomicBoolean resetting=new AtomicBoolean();
    final AtomicInteger active=new AtomicInteger();
    final boolean enabled;
    final String url,user,password;
    public HomologationReset(@Value("${APP_ENVIRONMENT:production}") String environment,@Value("${APP_ALLOW_RESET:false}") boolean allow,
        @Value("${spring.flyway.url}") String url,@Value("${spring.flyway.user}") String user,@Value("${spring.flyway.password}") String password){
        enabled=allow && environment.equals("homologation");this.url=url;this.user=user;this.password=password;
    }
    @Override public Mono<Void> filter(ServerWebExchange exchange,WebFilterChain chain){
        return Mono.defer(()->{
            active.incrementAndGet();
            if(resetting.get()){active.decrementAndGet();return Mono.error(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Homologação sendo reiniciada. Aguarde."));}
            return chain.filter(exchange).doFinally(signal->active.decrementAndGet());
        });
    }
    void clear() throws Exception {
        long deadline=System.nanoTime()+10_000_000_000L;
        while(active.get()>1){if(System.nanoTime()>deadline)throw Rules.conflict("Há operações em andamento. Tente novamente.");Thread.sleep(50);}
        // Dedicated connection: FK checks never leak into the application pool. TRUNCATE bypasses DELETE triggers.
        // This is deliberately a repeatable destructive reset, not a transactional financial correction.
        try(Connection connection=DriverManager.getConnection(url,user,password);Statement statement=connection.createStatement()){
            statement.execute("SET FOREIGN_KEY_CHECKS=0");
            for(String table:new String[]{"allocation_reversals","correction_replacements","correction_stock","corrections","settlement_allocations","settlements","financial_titles","stock_movements","sale_items","purchase_items","sales","purchases","expenses","opening_reversals","opening_stock","opening_balances","period_closures","stock_balances","products","customers","suppliers","operation_requests","product_code_sequences"}) statement.execute("TRUNCATE TABLE `"+table+"`");
            statement.execute("SET FOREIGN_KEY_CHECKS=1");
            statement.execute("INSERT INTO products(id,code,name,suggested_price,minimum_stock) VALUES(1,'CAM-001','Camarão',50,5)");
            statement.execute("INSERT INTO stock_balances(product_id) VALUES(1)");
            statement.execute("UPDATE opening_preferences SET dismissed=FALSE WHERE id=1");
            statement.execute("UPDATE automatic_closing_state SET next_date=NULL WHERE id=1");
        }
    }
}

@Service
class ResetCommand {
    private final HomologationReset reset;private final PeriodGuard guard;
    ResetCommand(HomologationReset reset,PeriodGuard guard){this.reset=reset;this.guard=guard;}
    @Transactional public Mono<Void> run(){return guard.lock().then(Mono.fromCallable(()->{reset.clear();return true;}).subscribeOn(Schedulers.boundedElastic())).then();}
}

@RestController
@RequestMapping("/api/v1/homologation")
class ResetController {
    private final HomologationReset reset;private final ResetCommand command;
    ResetController(HomologationReset reset,ResetCommand command){this.reset=reset;this.command=command;}
    @GetMapping("/status") Map<String,Boolean> status(){return Map.of("resetEnabled",reset.enabled);}
    public record Request(String confirmation){}
    @PostMapping("/reset") Mono<Void> reset(@RequestBody Request body){
        if(!reset.enabled)throw Rules.missing("Recurso indisponível.");
        Rules.require("APAGAR HOMOLOGACAO".equals(body.confirmation()),"Digite APAGAR HOMOLOGACAO para confirmar.");
        return Mono.defer(()->{
            if(!reset.resetting.compareAndSet(false,true))return Mono.error(Rules.conflict("Reset em andamento."));
            return command.run().doFinally(signal->reset.resetting.set(false));
        });
    }
}
