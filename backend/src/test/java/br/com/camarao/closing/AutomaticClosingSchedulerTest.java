package br.com.camarao.closing;

import org.junit.jupiter.api.Test;
import reactor.core.publisher.Mono;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class AutomaticClosingSchedulerTest {
    @Test void sameScheduledPublisherRetriesAfterFailureAndReadsStateAgain() {
        var service=mock(AutomaticClosingService.class);
        when(service.closeNextDueDay()).thenReturn(Mono.error(new IllegalStateException("Database temporarily unavailable")),Mono.empty(),Mono.empty());
        var publisher=new AutomaticClosingScheduler(service).closeDueDays();
        verifyNoInteractions(service);
        assertThatThrownBy(publisher::block).hasMessage("Database temporarily unavailable");
        publisher.block(); publisher.block();
        verify(service,times(3)).closeNextDueDay();
    }
}
