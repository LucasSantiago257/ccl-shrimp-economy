package br.com.camarao.closing;

import java.time.LocalDate;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class ClosingScheduleTest {
    @Test void remainsOpenUntil2359InBahia() {
        var now=LocalDateTime.parse("2026-11-04T02:58:59.999999");
        assertThat(ClosingSchedule.day(now)).isEqualTo(LocalDate.of(2026,11,3));
        assertThat(ClosingSchedule.reachedCutoff(now)).isFalse();
        assertThat(ClosingSchedule.dueThrough(now)).isEqualTo(LocalDate.of(2026,11,2));
    }
    @Test void closesExactlyAt2359DespiteUtcAlreadyBeingNextDay() {
        var now=LocalDateTime.parse("2026-11-04T02:59:00");
        assertThat(ClosingSchedule.reachedCutoff(now)).isTrue();
        assertThat(ClosingSchedule.dueThrough(now)).isEqualTo(LocalDate.of(2026,11,3));
    }
    @Test void lastSecondRemainsClosed() {
        assertThat(ClosingSchedule.reachedCutoff(LocalDateTime.parse("2026-11-04T02:59:59.999999"))).isTrue();
    }
    @Test void midnightReopensNewDayAndKeepsYesterdayDue() {
        var now=LocalDateTime.parse("2026-11-04T03:00:00");
        assertThat(ClosingSchedule.day(now)).isEqualTo(LocalDate.of(2026,11,4));
        assertThat(ClosingSchedule.reachedCutoff(now)).isFalse();
        assertThat(ClosingSchedule.dueThrough(now)).isEqualTo(LocalDate.of(2026,11,3));
    }
}
