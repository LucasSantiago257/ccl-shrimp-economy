package br.com.camarao.shared;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class PageQueryTest {
    @Test void rejectsInvalidBoundsInsteadOfLoadingUnlimitedRows() {
        assertThatThrownBy(() -> new PageQuery(0,20,"")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> new PageQuery(1,0,"")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> new PageQuery(1,101,"")).isInstanceOf(ResponseStatusException.class);
    }
    @Test void largePageNumberDoesNotOverflowOffset() {
        assertThat(new PageQuery(Integer.MAX_VALUE,100,"").offset()).isEqualTo(214748364600L);
    }
    @Test void treatsSearchWildcardsAsLiteralText() {
        assertThat(new PageQuery(1,20,"  50%_!  ").like()).isEqualTo("%50!%!_!!%");
    }
}
