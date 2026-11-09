# Implantação dos saldos e extração de mês/ano

## Exportação compacta

Na tela **Fechamento**, os atalhos Mês atual, Mês anterior, Ano atual e Ano anterior ajustam as datas. Também é possível escolher um intervalo pelas datas.

**Exportar resumo CSV** oferece dois formatos:

- **Mensal:** uma linha por mês, respeitando meses parciais. Aceita até 366 dias; um ano completo tem 12 linhas de dados.
- **Consolidado:** uma linha para todo o intervalo selecionado, de até dez anos.

O CSV usa UTF-8 com BOM, separador ponto e vírgula e vírgula decimal para facilitar a abertura no Excel. Inclui vendas brutas/líquidas, descontos, compras, custos, despesas, perdas, resultado, recebimentos, pagamentos, saldo importado, posição do caixa, contas e estoque. Saldos são posições na data final de cada linha: não se deve somar saldos mensais para obter o saldo anual. Para o saldo final e os totais de todo o ano, use o consolidado.

A exportação não exige fechar o intervalo novamente e não junta snapshots diários. Usa as mesmas regras e transação de leitura dos relatórios, com no máximo 13 faixas mensais parciais. Não copia listas de clientes, itens de documentos ou títulos antigos para o arquivo de resumo. O tamanho depende das faixas selecionadas, e não da quantidade de documentos. Os arquivos completos de auditoria permanecem disponíveis e os snapshots já existentes não são modificados.

API autenticada e somente de leitura:

`GET /api/v1/reports/export?from=2026-01-01&to=2026-12-31&grouping=month`

`grouping=total` produz o consolidado. Formato desconhecido, datas invertidas ou intervalo excessivo retornam 422. Falta de autenticação retorna 401. O download tem Content-Disposition de anexo e Cache-Control: no-store.

## Saldo inicial

A tela **Saldo inicial**, em Cadastros, recebe a posição anterior às primeiras operações na Maré:

O preenchimento é opcional. Na Visão geral aparece um lembrete com **X** para dispensar. A própria tela de Saldo inicial também tem um **X** para voltar à operação sem informar valores. A escolha fica salva no servidor, inclusive após recarregar ou acessar por outro dispositivo; não cria implantação nem registros financeiros. É possível retornar pelo menu antes do primeiro lançamento. Confirmar uma implantação posteriormente limpa essa preferência.

1. Dinheiro em caixa e bancos, agregado na conta operacional.
2. Produtos disponíveis, em kg, e seu custo médio de aquisição. O sistema calcula o valor de estoque; o preço de venda não é usado como custo.
3. Contas antigas a receber por cliente e contas antigas a pagar. Compras de mercadoria e outras obrigações são identificadas separadamente. Fornecedor continua opcional nas contas a pagar.
4. Observação, conferência dos totais e confirmação explícita.

Cadastros de produtos, clientes e fornecedores podem ser feitos antes. O formulário recebe até 100 produtos e 200 contas, com seletores paginados. Isso é configuração manual da posição das planilhas; leitura automática de XLSX/CSV não faz parte deste fluxo.

O registro é feito na data atual, no horário da Bahia, e exige dia aberto. Não é permitido registrar saldos retroativos. **A implantação só fica disponível antes do primeiro lançamento operacional**, para não somar novamente valores já registrados. Uma base em operação conserva seus dados e recebe uma explicação na tela; ela não é zerada para liberar a configuração.

Depois da confirmação, a página mostra os valores originalmente informados. Os saldos atuais e baixas posteriores ficam nas telas Estoque e Financeiro.

## Tratamento financeiro e de estoque

- Estoque inicial usa origem OPENING, separada de compras, vendas e perdas. Atualiza o saldo e o custo médio e participa do custo das próximas vendas.
- Dinheiro inicial não é recebimento de venda e não aumenta o resultado. O relatório identifica `initial_cash`, o valor líquido da implantação dentro do intervalo.
- `closing_cash = opening_cash + initial_cash + received - paid`.
- Dívidas antigas viram títulos próprios, sem venda, compra ou despesa fictícia. Entram nas pendências e nos saldos de clientes/fornecedores. A parcela identificada como compra aparece em Compras a pagar; outras obrigações só entram no total a pagar.
- Pagar ou receber uma dívida antiga movimenta o caixa na data da baixa e reduz o título; não reconhece novamente receita ou despesa do passado.
- O dinheiro inicial pode ser negativo para representar saldo bancário devedor. A tela orienta a não repetir o mesmo saldo devedor em contas a pagar.

Exemplo: implantação de R$ 500 em dinheiro, 10 kg a R$ 30/kg, R$ 120 a receber e R$ 80 de compras a pagar gera caixa de R$ 500, estoque de R$ 300 e resultado zero. Receber R$ 30 antigos leva o caixa a R$ 530 e a dívida a R$ 90, mantendo resultado zero. Uma venda posterior usa o custo de R$ 30/kg.

## Correção e preservação

**Corrigir saldo inicial** registra um estorno integral com motivo e permite preencher os valores corretos. Só é permitido no mesmo dia, antes de qualquer lançamento operacional e antes do fechamento. As linhas originais e os estornos ficam imutáveis; não são apagados.

A trava transacional compartilhada impede que duas implantações ou uma implantação e um primeiro lançamento decidam simultaneamente com dados antigos. Confirmação e estorno usam Idempotency-Key. Falha de validação, produto inativo, cliente inexistente ou outro erro faz rollback de todo o conjunto.

Após operar ou fechar o dia, a implantação permanece preservada. Ajustes de inventário posteriores são um fluxo distinto, ainda não implementado; a configuração inicial não substitui esse módulo.

Os snapshots novos usam schemaVersion 4 e incluem implantação, estoque inicial e estornos. Os snapshots anteriores mantêm seus bytes, hash e leitura. Cada movimento possui `event_key` estável, pois origens de estoque diferentes podem ter IDs numéricos iguais; consumidores devem usar essa chave para identificar eventos.

API:

- `GET /api/v1/opening-balances`: configured, hasPostings, dayClosed, canUndo, date, opening, stock e debts.
- `PUT /api/v1/opening-balances/preference`: dismissed boolean obrigatório, exige autenticação e CSRF. Preferência de interface idempotente, sem efeito nos saldos; GET inclui o campo dismissed.
- `POST /api/v1/opening-balances`: cashAmount, stock[{productId,quantity,unitCost}], debts[{nature,partyId,description,amount,dueDate,purchaseRelated}], note e confirmed=true. Exige CSRF, autenticação e Idempotency-Key.
- `POST /api/v1/opening-balances/{id}/undo`: reason de 5 a 500 caracteres, com as mesmas proteções.

`nature` aceita RECEIVABLE ou PAYABLE. Cliente é obrigatório a receber; fornecedor é opcional a pagar. purchaseRelated=true só é válido para PAYABLE. Não enviar cabeçalhos ou campos para forçar uma data anterior.

## Validação

- `tests/opening-export.browser.mjs`: MySQL isolado, reenvios simultâneos, rollback, implantação pela tela de 390 px, estorno e nova confirmação, dívidas antigas, custo de venda, cancelamento, exportação anual e fechamento.
- `scripts/Test-Opening.ps1`: teste optativo de MySQL com relógio controlado. Verifica mudança de dia, saldos históricos, fechamento preservado, recebimentos futuros e corte às 23h59.
- `tests/compact-export-load.mjs`: após a suíte da tela, carrega 10 mil documentos sintéticos apenas no banco de teste e compara o resumo com o arquivo de auditoria. Projeto indicado por OPENING_TEST_PROJECT deve começar com camarao-opening-; destino fixo nas portas de teste.
- `ReportExportTest`: limites, ano bissexto e meses parciais.

No ensaio com 10 mil vendas, o resumo anual teve 12 linhas e 3.260 bytes; o snapshot completo tinha 12.102.361 bytes. O resumo foi gerado em aproximadamente 455 ms no computador local. Estes números não são uma garantia de latência na hospedagem.
