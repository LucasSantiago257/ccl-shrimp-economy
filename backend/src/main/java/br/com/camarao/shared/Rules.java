package br.com.camarao.shared;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class Rules {
    public static final ZoneId ZONE = ZoneId.of("America/Bahia");
    private Rules() {}
    public static BigDecimal money(BigDecimal value) { return value.setScale(2,RoundingMode.HALF_UP); }
    public static BigDecimal precise(BigDecimal value) { return value.setScale(6,RoundingMode.HALF_UP); }
    public static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC); }
    public static LocalDate today() { return LocalDate.now(ZONE); }
    public static LocalDateTime start(LocalDate date) {
        return date.atStartOfDay(ZONE).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
    }
    public static ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,message); }
    public static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT,message); }
    public static ResponseStatusException missing(String message) { return new ResponseStatusException(HttpStatus.NOT_FOUND,message); }
    public static void require(boolean condition, String message) { if (!condition) throw invalid(message); }
}
