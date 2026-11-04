package br.com.camarao.closing;

import jakarta.validation.Valid;
import br.com.camarao.shared.*;
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
    private final SnapshotCsv csv;
    public ClosingController(ClosingService service,SnapshotCsv csv) { this.service=service;this.csv=csv; }
    @GetMapping public Mono<PageResult> list(@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="") String q) { return service.list(new PageQuery(page,size,q)); }
    @GetMapping("/status") public Mono<Map<String,Object>> status() { return service.status(); }
    @GetMapping("/{id}") public Mono<Map<String,Object>> detail(@PathVariable long id) { return service.detail(id); }
    @GetMapping("/{id}/snapshot") public Mono<ResponseEntity<byte[]>> snapshot(@PathVariable long id) {
        return service.json(id).map(json -> ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
            .header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=mare-fechamento-"+id+".csv")
            .header(HttpHeaders.CACHE_CONTROL,"no-store").body(csv.render(json).getBytes(StandardCharsets.UTF_8)));
    }
    @PostMapping public Mono<Map<String,Long>> close(@RequestHeader("Idempotency-Key") String key,@Valid @RequestBody ClosingService.ClosePeriod period,Principal actor) {
        return service.close(key,period,actor.getName());
    }
}
