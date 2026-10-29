package br.com.camarao.closing;

import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.util.Map;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/closings")
public class ClosingController {
    private final ClosingService service;
    public ClosingController(ClosingService service) { this.service=service; }
    @GetMapping public Flux<Map<String,Object>> list() { return service.list(); }
    @GetMapping("/status") public Mono<Map<String,Object>> status() { return service.status(); }
    @GetMapping("/{id}") public Mono<Map<String,Object>> detail(@PathVariable long id) { return service.detail(id); }
    @GetMapping("/{id}/snapshot") public Mono<ResponseEntity<byte[]>> snapshot(@PathVariable long id) {
        return service.json(id).map(json -> ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON)
            .header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=mare-fechamento-"+id+".json")
            .header(HttpHeaders.CACHE_CONTROL,"no-store").body(json.getBytes(StandardCharsets.UTF_8)));
    }
    @PostMapping public Mono<Map<String,Long>> close(@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ClosingService.ClosePeriod period,Principal actor) {
        return service.close(key,period,actor.getName());
    }
}
