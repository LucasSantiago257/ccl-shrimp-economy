package br.com.camarao.report;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;

class ReportExportTest {
    @Test void leapYearHasOnlyTwelveMonthlyRows() {
        var ranges=ReportExportService.ranges(LocalDate.of(2024,1,1),LocalDate.of(2024,12,31),"month");
        assertEquals(12,ranges.size());assertEquals(LocalDate.of(2024,2,29),ranges.get(1).to());
    }
    @Test void partialMonthsRespectSelectedDatesAndConsolidatedHasOneRow() {
        var from=LocalDate.of(2026,10,15);var to=LocalDate.of(2026,11,8);
        var ranges=ReportExportService.ranges(from,to,"month");
        assertEquals(2,ranges.size());assertEquals(from,ranges.getFirst().from());assertEquals(to,ranges.getLast().to());
        assertEquals(1,ReportExportService.ranges(from,to,"total").size());
    }
    @Test void rejectsUnboundedOrUnsupportedGrouping() {
        var from=LocalDate.of(2024,1,1);
        assertThrows(ResponseStatusException.class,()->ReportExportService.ranges(from,from.plusDays(366),"month"));
        assertThrows(ResponseStatusException.class,()->ReportExportService.ranges(from,from.minusDays(1),"total"));
        assertThrows(ResponseStatusException.class,()->ReportExportService.ranges(from,from,"raw"));
    }
}
