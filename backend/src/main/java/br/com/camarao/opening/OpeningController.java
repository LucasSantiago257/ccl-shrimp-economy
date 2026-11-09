package br.com.camarao.opening;

import jakarta.validation.Valid;
import java.security.Principal;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/opening-balances")
public class OpeningController {
    private final OpeningService service;
    public OpeningController(OpeningService service) {this.service=service;}
    @GetMapping public Mono<Map<String,Object>> status() {return service.status();}
    @PostMapping public Mono<Map<String,Long>> confirm(@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody OpeningService.Request body,Principal actor) {return service.confirm(key,body,actor.getName());}
    @PostMapping("/{id}/undo") public Mono<Map<String,Long>> undo(@PathVariable long id,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody OpeningService.Undo body,Principal actor) {return service.undo(key,id,body,actor.getName());}
}
