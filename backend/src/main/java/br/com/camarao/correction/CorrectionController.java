package br.com.camarao.correction;

import br.com.camarao.shared.*;
import jakarta.validation.Valid;
import java.security.Principal;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/corrections")
public class CorrectionController {
    private final CorrectionService service;
    public CorrectionController(CorrectionService service) { this.service=service; }

    @GetMapping
    public Mono<PageResult> list(@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="") String q) {
        return service.list(new PageQuery(page,size,q));
    }
    @GetMapping("/{kind}/{id}/preview")
    public Mono<Map<String,Object>> preview(@PathVariable CorrectionService.Kind kind,@PathVariable long id) {
        return service.preview(kind,id);
    }
    @PostMapping("/{kind}/{id}")
    public Mono<Map<String,Long>> cancel(@PathVariable CorrectionService.Kind kind,@PathVariable long id,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody CorrectionService.Request body,Principal actor) {
        return service.cancel(key,kind,id,body,actor.getName());
    }
    @PostMapping("/{id}/replacement")
    public Mono<Map<String,Long>> link(@PathVariable long id,@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody CorrectionService.Replacement body,Principal actor) {
        return service.link(key,id,body,actor.getName());
    }
    @GetMapping("/{id}/candidates")
    public Mono<PageResult> candidates(@PathVariable long id,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="") String q) {
        return service.candidates(id,new PageQuery(page,size,q));
    }
}

