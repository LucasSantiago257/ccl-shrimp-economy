# Correções e totais por período

A V5 cria um diário de correções e vínculos de substituição, protegidos contra UPDATE e DELETE. Os documentos originais continuam sendo a origem das informações. As consultas de resultado e caixa usam eventos positivos originais e eventos negativos na data do cancelamento. O estoque usa movimentos originais e seus inversos, vinculados por correction_stock.

O título conserva seu valor original. A posição corrente fica zerada após cancelar o documento, e pagamentos estornados deixam de baixar o saldo. As consultas históricas consideram somente ajustes e baixas anteriores ao fim solicitado. O catálogo, extrato, financeiro, fechamento, CSV e dashboards usam essas posições.

Cada correção é uma transação reativa sob business_guard, com a mesma política de idempotência dos outros comandos. O dia atual deve estar aberto e ainda não pode ter chegado às 23h59 em America/Bahia. Repetições idempotentes de operações já concluídas retornam o ID anterior.

## Dependências

Antes de cancelar uma compra, venda ou despesa, o usuário cancela os pagamentos vinculados que ainda estiverem ativos. O cancelamento de um pagamento reabre todas as contas de sua alocação e estorna seu registro de caixa, na data atual.

Antes de cancelar um documento que alterou estoque, todos os movimentos posteriores ativos de cada produto devem estar corrigidos. O cancelamento em ordem inversa restaura o valor exato de cada movimento, incluindo consumo pelo custo médio e perdas. Produtos inativos também podem ter seus erros cancelados. Quantidade e valor negativos são recusados. Se qualquer item falhar, nenhum saldo ou estorno é confirmado.

O substituto deve ser outro registro do mesmo tipo, criado a partir do instante do cancelamento, ativo e ainda sem vínculo de substituição. O vínculo é único e permanente. Uma correção posterior do substituto forma uma cadeia auditável.

## API

Todas as rotas são autenticadas. POST exige CSRF e Idempotency-Key.

- GET /api/v1/corrections retorna o histórico paginado, pesquisável por motivo e números.
- GET /api/v1/corrections/{kind}/{id}/preview retorna original, ajustes de estoque, pagamentos, movimentos dependentes, alocações do pagamento e correção existente.
- POST /api/v1/corrections/{kind}/{id} recebe {"reason":"Motivo do registro incorreto"} e retorna {"id":123}.
- GET /api/v1/corrections/{id}/candidates pagina os substitutos elegíveis.
- POST /api/v1/corrections/{id}/replacement recebe {"sourceId":456} e retorna o ID da correção.
- POST /api/v1/corrections/{id}/replacement/new recebe os campos normais do tipo original e retorna o ID do novo lançamento. A criação e o vínculo são confirmados juntos. Se o vínculo falhar, o documento, estoque, título e pagamentos do novo registro são revertidos.

kind aceita SALE, PURCHASE, EXPENSE, PAYMENT ou LOSS. Para LOSS, o ID é o movimento original de perda. O estado de cancelamento nas listas é indicado por correction_id. Nos movimentos de estoque, correction_id identifica o próprio evento de estorno e cancelled_by_correction identifica a correção do movimento de origem.

Compras e vendas aceitam from/to inclusivos no fuso America/Bahia. As duas datas são opcionais em conjunto. Sem elas, permanece disponível todo o histórico. São aceitos intervalos de até dez anos. O envelope paginado inclui summary com total e quantity líquidos, gross_total, discount_amount, registered_total, reversed_total e reversed_quantity de todos os registros do filtro.

A lista exibe os documentos emitidos no intervalo. Os totais somam os eventos do intervalo, incluindo estornos de documentos emitidos antes dele. A busca por pessoa ou ID aplica-se tanto à lista quanto aos totais. Os valores são consistentes com o relatório para o mesmo período sem busca adicional.

## Snapshots

Novos snapshots usam schemaVersion 3. Incluem o diário de correções, valores originais, vínculos de estorno de estoque, estornos financeiros e substituições. Posições de títulos excluem informações de cancelamentos futuros em relação à data final. Snapshots anteriores conservam seus bytes e hash e seguem legíveis na interface.

## Verificação

Test-Corrections.ps1 cria um MySQL novo de teste e executa CorrectionDatabaseTest com um relógio controlado. O teste cobre os cinco tipos, dias fechados, idempotência, concorrência, pagamentos distribuídos entre contas, produtos inativos, dependências, falha após o primeiro item e restauração integral da transação. Também confere totais por período e posições históricas.

tests/corrections.browser.mjs usa a aplicação isolada das portas 18080/15173. Valida prévia, motivo, confirmação, cancelamento, substituto, origem, histórico, proteção CSRF e layout móvel.
