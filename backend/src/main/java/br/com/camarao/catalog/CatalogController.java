package br.com.camarao.catalog;

import jakarta.validation.Valid;
import br.com.camarao.shared.*;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1")
public class CatalogController {
    private final CatalogService service;
    public CatalogController(CatalogService service) { this.service=service; }
    @GetMapping("/customers") public Mono<PageResult> customers(@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="false") boolean activeOnly) { return service.partners(true,new PageQuery(page,size,q),activeOnly); }
    @PostMapping("/customers") public Mono<Map<String,Long>> customer(@Valid @RequestBody CatalogService.Partner p) { return service.createPartner(true,p); }
    @PutMapping("/customers/{id}") public Mono<Void> customer(@PathVariable long id,@Valid @RequestBody CatalogService.Partner p) { return service.editPartner(true,id,p); }
    @GetMapping("/suppliers") public Mono<PageResult> suppliers(@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="false") boolean activeOnly) { return service.partners(false,new PageQuery(page,size,q),activeOnly); }
    @PostMapping("/suppliers") public Mono<Map<String,Long>> supplier(@Valid @RequestBody CatalogService.Partner p) { return service.createPartner(false,p); }
    @PutMapping("/suppliers/{id}") public Mono<Void> supplier(@PathVariable long id,@Valid @RequestBody CatalogService.Partner p) { return service.editPartner(false,id,p); }
    @GetMapping("/products") public Mono<PageResult> products(@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="1") int page,@RequestParam(defaultValue="20") int size,@RequestParam(defaultValue="false") boolean activeOnly,@RequestParam(defaultValue="false") boolean inStockOnly) { return service.products(new PageQuery(page,size,q),activeOnly,inStockOnly); }
    @PostMapping("/products") public Mono<Map<String,Long>> product(@Valid @RequestBody CatalogService.Product p) { return service.createProduct(p); }
    @PutMapping("/products/{id}") public Mono<Void> product(@PathVariable long id,@Valid @RequestBody CatalogService.Product p) { return service.editProduct(id,p); }
}
