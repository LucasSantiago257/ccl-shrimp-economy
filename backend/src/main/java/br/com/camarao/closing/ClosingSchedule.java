package br.com.camarao.closing;

import br.com.camarao.shared.Rules;
import java.time.*;

public final class ClosingSchedule {
    public static final LocalTime CUTOFF = LocalTime.of(23,59);
    private ClosingSchedule() {}
    private static ZonedDateTime local(LocalDateTime utc) { return utc.atOffset(ZoneOffset.UTC).atZoneSameInstant(Rules.ZONE); }
    public static LocalDate day(LocalDateTime utc) { return local(utc).toLocalDate(); }
    public static boolean reachedCutoff(LocalDateTime utc) { return !local(utc).toLocalTime().isBefore(CUTOFF); }
    public static LocalDate dueThrough(LocalDateTime utc) { return reachedCutoff(utc) ? day(utc) : day(utc).minusDays(1); }
}
