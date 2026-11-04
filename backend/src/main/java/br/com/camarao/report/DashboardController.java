package br.com.camarao.report;

import java.time.LocalDate;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/reports")
public class DashboardController {
    private final DashboardService dashboards;
    public DashboardController(DashboardService dashboards) { this.dashboards = dashboards; }

    @GetMapping("/dashboard")
    public Mono<Map<String,Object>> dashboard(@RequestParam LocalDate from, @RequestParam LocalDate to) {
        return dashboards.load(from, to);
    }
}

