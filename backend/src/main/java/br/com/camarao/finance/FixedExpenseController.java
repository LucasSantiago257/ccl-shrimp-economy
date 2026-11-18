package br.com.camarao.finance;

import br.com.camarao.shared.*;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/fixed-expenses")
public class FixedExpenseController {
    private final FixedExpenses rules;
    public FixedExpenseController(FixedExpenses rules) { this.rules=rules; }

    @GetMapping
    public Mono<PageResult> list(@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,
                                 @RequestParam(defaultValue="") String q) {
        return rules.list(new PageQuery(page,size,q));
    }
    @PostMapping
    public Mono<Map<String,Long>> create(@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody FixedExpenses.Rule rule,Principal actor) {
        return rules.create(key,rule,actor.getName());
    }
    @PostMapping("/{id}/stop")
    public Mono<Void> stop(@PathVariable long id) { return rules.stop(id); }

}
