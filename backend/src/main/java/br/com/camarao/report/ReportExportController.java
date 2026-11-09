package br.com.camarao.report;

import java.time.LocalDate;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportExportController {
    private final ReportExportService service;
    public ReportExportController(ReportExportService service){this.service=service;}
    @GetMapping("/export")
    public Mono<ResponseEntity<String>> export(@RequestParam LocalDate from,@RequestParam LocalDate to,@RequestParam(defaultValue="month") String grouping){
        return service.export(from,to,grouping).map(csv->ResponseEntity.ok().contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
            .header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=mare-resumo-"+grouping+"-"+from+"-"+to+".csv")
            .header(HttpHeaders.CACHE_CONTROL,"no-store").body(csv));
    }
}
