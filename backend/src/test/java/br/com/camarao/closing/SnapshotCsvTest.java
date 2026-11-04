package br.com.camarao.closing;
import org.junit.jupiter.api.Test;
import com.fasterxml.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
class SnapshotCsvTest {
    private final SnapshotCsv csv=new SnapshotCsv(new ObjectMapper());
    @Test void exportsNestedRecordsAndEscapesSpreadsheetFormulas() {
        String text=csv.render("{\"records\":{\"sales\":[{\"id\":1,\"note\":\"=SUM(1;2)\\nunsafe\"}]},\"report\":{\"revenue\":-12.50}}");
        assertThat(text).startsWith("\uFEFFSeção;Registro;Campo;Valor\r\n");
        assertThat(text).contains("sales[0].id","'=SUM(1;2)","-12,5");
        assertThat(text).doesNotContain("\"=-12");
    }
    @Test void quotesNamesWithDelimitersAndQuotes() {
        assertThat(csv.render("{\"name\":\"Maria; \\\"Teste\\\"\"}")).contains("Maria; \"\"Teste\"\"");
    }
    @Test void preservesDecimalPrecision() {
        assertThat(csv.render("{\"value\":123456789012.123456}")).contains("123456789012,123456");
    }
}

