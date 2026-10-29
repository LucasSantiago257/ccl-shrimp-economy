package br.com.camarao.closing;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class SnapshotHashTest {
    @Test void sha256MatchesKnownStandardVector() {
        assertThat(ClosingService.sha256("abc")).isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
    @Test void evenSmallContentChangesAlterFingerprint() {
        assertThat(ClosingService.sha256("{\"amount\":100}")).isNotEqualTo(ClosingService.sha256("{\"amount\":101}"));
    }
}
