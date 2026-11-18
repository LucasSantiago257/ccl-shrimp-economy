package br.com.camarao.stock;

import br.com.camarao.shared.*;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/processing")
public class ProcessingController {
    private final ProcessingService service;

    public ProcessingController(ProcessingService service) { this.service=service; }

    @GetMapping
    public Mono<PageResult> list(@RequestParam(defaultValue="1") int page,
        @RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="") String q) {
        return service.list(new PageQuery(page,size,q));
    }

    @PostMapping
    public Mono<Map<String,Long>> create(@RequestHeader("Idempotency-Key") String key,
        @Valid @RequestBody ProcessingService.Request body,Principal actor) {
        return service.create(key,body,actor.getName());
    }
}
