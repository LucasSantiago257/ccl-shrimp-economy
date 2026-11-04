# Validação

Execução inicial em 28/10/2026; correções e totais por período validados em 04/11/2026, no fuso America/Bahia.

## Resultado

| Verificação | Resultado |
|---|---|
| Compilação Java 21 / Spring Boot 3.5.16 | Aprovada |
| Testes unitários de custo, desconto, paginação, hash e fechamento automático | 22 aprovados, 0 falhas; integração optativa separada do build normal |
| Integração do fechamento automático com MySQL real e relógio controlado | 1 teste de ciclo completo aprovado |
| Compilação TypeScript e build Vite | Aprovados |
| Build dos containers Java e Nginx | Aprovado |
| Migrações Flyway 11.20.3 em MySQL 8.4 | V1 a V5 aplicadas com sucesso |
| Integração HTTP com MySQL real | 24 de regressão + 17 de desconto/paginação + 13 de fechamento aprovadas |
| Teste no navegador Microsoft Edge | Aprovado |
| Nove telas em viewport de 390 × 844 | Sem overflow horizontal da página |
| Formulário de venda em celular | Exibido e conferido visualmente |
| Erros JavaScript durante o fluxo de navegador | Nenhum |
| Credenciais/tokens no localStorage | Nenhum |
| Ambiente operacional em localhost:5173 | Preservado; massas fictícias criadas exclusivamente nos ambientes isolados de teste |

## Integração validada

1. Endpoints operacionais exigem autenticação.
2. Login com sessão e CSRF.
3. Banco de teste inicia sem lançamentos.
4. Cadastros e estoque inicial zero.
5. POST sem CSRF é bloqueado.
6. Compra de 100 kg a R$ 30 com pagamento integral calculado no servidor.
7. Venda de 40 kg a R$ 50 com recebimento parcial e dívida de R$ 1.000.
8. Reenvio idempotente não duplica venda/estoque; chave com outro payload é rejeitada.
9. Recebimento posterior de R$ 400 deixa dívida de R$ 600 sem movimentar estoque.
10. Despesa paga e fechamento conciliado: receita R$ 2.000, CMV R$ 1.200, lucro bruto R$ 800, resultado R$ 700, fluxo de caixa −R$ 1.700, estoque 60 kg/R$ 1.800.
11. Consulta do dia anterior não inclui operações posteriores.
12. Pagamento acima da dívida é rejeitado sem registrar movimentação.
13. Venda sem estoque não deixa documento, dívida nem movimento.
14. Quantidade negativa e precisão acima de gramas são rejeitadas.
15. Perda reduz estoque e resultado, sem alterar caixa.
16. Falha no segundo item reverte também a alteração do primeiro.
17. Duas vendas concorrentes disputando o mesmo último quilo não geram estoque negativo.
18. Dois pagamentos concorrentes não quitam além do valor devido.
19. Alterar o preço do produto não altera receita ou custo de venda antiga.
20. Um pagamento não pode misturar dívidas de clientes diferentes.
21. Um pagamento pode quitar duas contas do mesmo cliente.
22. Pagamento integral respeita HALF_UP: item de R$ 0,005 totaliza R$ 0,01.
23. Duas requisições simultâneas com a mesma chave criam uma única despesa.
24. Logout encerra o acesso.

O script reproduzível está em `scripts/integration.mjs`. O teste de concorrência usa requisições simultâneas reais ao back-end e MySQL, sem repositórios simulados.

## Fluxo de navegador

Microsoft Edge em sessão de teste sem perfil pessoal. Login → cadastro de cliente e fornecedor → compra de 5 kg → venda de 1,25 kg por R$ 62,50 com entrada de R$ 20 → recebimento adicional de R$ 10 → dívida restante de R$ 32,50.

Depois, navegação pelas telas Visão geral, Clientes, Produtos, Compras, Vendas, Estoque, Financeiro, Despesas e Fechamento em 390px. Capturas de computador, painel móvel e formulário móvel conferidas visualmente em `docs/previews/`. Tabelas largas usam rolagem interna, sem ampliar a largura da página.

## Escopo e limites dos testes

Os testes comprovam os cenários descritos; não constituem teste de carga ou auditoria de segurança/acessibilidade completa. Não houve homologação em Safari/iPhone físico, integração bancária, emissão fiscal, recuperação de desastre ou implantação pública. O ambiente operacional é separado dos volumes e lançamentos fictícios dos testes.

Cancelamentos e devoluções continuam pendentes, conforme README. O fechamento definitivo e seu bloqueio foram incluídos e validados.

## Fechamento, fornecedor opcional e painel

Treze verificações adicionais em `scripts/closing-integration.mjs`:

1. Compra sem `partyId` gera estoque, pagamento parcial e título identificado pela compra.
2. Despesa pendente aumenta o total a pagar, mas não o indicador de compras a pagar.
3. Compra com `partyId=null` pode ser quitada integralmente.
4. Venda continua exigindo cliente.
5. Fechamento de data futura ou intervalo invertido é rejeitado.
6. Fechar ontem não bloqueia lançamentos hoje.
7. Intervalos sobrepostos são rejeitados.
8. Concorrência entre despesa e fechamento define uma fronteira atômica: operação incluída por completo ou recusada.
9. Snapshot contém metadados, documentos, itens, movimentos, pagamentos e posição das contas.
10. SHA-256 do JSON baixado coincide com o hash preservado.
11. Fechamento é idempotente; nova chave para o mesmo intervalo é rejeitada.
12. Cinco tipos de lançamentos diretos à API são bloqueados após fechar o dia, sem efeitos parciais.
13. Mudanças de nome/preço em cadastros não mudam os bytes ou nomes do snapshot.

Também foram executados UPDATE e DELETE diretamente no MySQL de teste; ambos foram rejeitados pelos triggers de imutabilidade.

No navegador, foram validados compra a prazo sem fornecedor e os dois grupos de pendências no painel. `tests/closing.browser.mjs` confirmou o fechamento de um período pela interface, confirmação explícita, banner do dia fechado, abertura do snapshot, download com hash correto, layout móvel e botão de venda desabilitado.

## Desconto e paginação — 03/11/2026

`scripts/discount-pagination-integration.mjs` aprovou 17 cenários: desconto parcial, quitação pelo líquido, desconto integral sem título zero, validação de limites/precisão, idempotência, páginas vazias, busca literal por curingas, telefone/documento e navegação sem duplicações ou cortes.

A massa foi criada pela API real, com transações no MySQL: mais de 200 clientes/produtos/documentos/pagamentos, 411 movimentos do produto testado e 511 títulos a pagar correspondentes ao filtro. Foram percorridas todas as páginas, conferindo contagem, IDs únicos e resumos globais. Nenhuma massa foi criada na base operacional.

O teste de navegador `tests/discount-pagination.browser.mjs` validou última página, busca e mudança para 50 registros por página; seleção de cliente e produto além da primeira página; venda de R$ 100 com desconto de R$ 10 e entrada de R$ 20; extrato com mais de 200 títulos, total agregado e pagamento em outra página; layout de 390px sem overflow e sem erros JavaScript.

A regressão de fechamento também verificou os campos de desconto, o snapshot completo com mais de 500 títulos e a paginação da lista de fechamentos. O JSON preservado continua completo e seu SHA-256 foi conferido após o fechamento. As capturas são locais e não são versionadas.

Também foi migrado um volume antigo de teste de V2 para V3: três snapshots do formato 1 mantiveram seus hashes e cinco vendas antigas mantiveram seus totais, com desconto zero. Esse teste foi somente de leitura após a migração e não alterou os snapshots.

## Fechamento automático — 03/11/2026

O build normal aprovou 22 testes unitários. As novas verificações cobrem 23h58min59s, o corte exato de 23h59 em America/Bahia (02h59 UTC do dia seguinte), o último segundo do dia, liberação à meia-noite, bloqueio sem snapshot pronto e nova assinatura do agendador após falha. O teste de banco optativo não roda no build comum.

`AutomaticClosingDatabaseTest` executou o fluxo real de serviços, transações R2DBC, migrações e MySQL em uma base nova e isolada. Um relógio injetável simulou os horários, sem mudar o relógio do computador. Foram conferidos: ausência de fechamento antecipado, status pendente e bloqueio de despesa às 23h59, quatro execuções simultâneas com um único snapshot, preservação de fechamento manual, recuperação de três dias sem movimento, repetição sem duplicação, concorrência manual/automática e integridade SHA-256.

Uma falha foi provocada depois da inserção do snapshot, durante o avanço do cursor: a transação reverteu os dois registros e a tentativa seguinte concluiu normalmente. Os triggers de falha existiram somente no banco de teste e foram removidos no próprio teste. `scripts/Test-AutomaticClosing.ps1` reproduz o cenário com um novo projeto Docker e preserva somente seu volume ao encerrar.

Na aplicação de teste, os 24 cenários gerais, 17 de desconto/paginação e 13 de fechamento voltaram a passar. O navegador também aprovou confirmação manual, banner de dia fechado, snapshot e download com hash correto, visualização móvel e bloqueio dos lançamentos. A configuração de produção agenda o corte sem depender de navegador ou sessão de usuário; as capturas automáticas usam o autor `Sistema (automático)`.

## Correções e totais por período — 04/11/2026

O build Java e TypeScript foi aprovado. O teste optativo CorrectionDatabaseTest usou serviços reais e MySQL isolado, com relógio controlado. Foram validados os cinco tipos de lançamento, motivo obrigatório, estorno em data atual, pagamentos compartilhados entre contas, bloqueio por movimentos posteriores, restauração de produto inativo, idempotência e quatro cancelamentos concorrentes com uma única confirmação.

Uma falha provocada no segundo produto de uma compra confirmou o rollback integral do primeiro produto, do diário de correção e dos vínculos de estoque. A tentativa seguinte concluiu corretamente. Triggers de auditoria recusaram alterações do histórico.

A consulta do dia original manteve receita, despesa, estoque e títulos anteriores ao ajuste. O snapshot já fechado manteve seus bytes e hash. Também foi capturado um snapshot de data passada depois de uma correção futura e seus títulos conservaram a situação daquela data, sem metadados futuros de cancelamento.

Os totais de compras e vendas foram confrontados com o relatório para o dia original, o dia da correção e o intervalo combinado. Foram verificados estornos de R$ 600 e 20 kg em compras, e R$ 240 e 5 kg em vendas, na data do ajuste. Intervalos incompletos ou invertidos foram rejeitados.

Os testes de navegador corrections.browser.mjs e trade-periods.browser.mjs aprovaram prévia, motivo, confirmação, cancelamento, selo na origem, substituto, histórico, proteção CSRF, filtros de datas, busca, totais em todas as páginas e cartão de compras no dashboard. A tela móvel de 390 px ficou sem overflow horizontal e sem erros JavaScript.

A regressão de API aprovou novamente 24 cenários gerais, 17 de desconto/paginação e 13 de fechamento. Todas as massas fictícias foram criadas nos ambientes isolados. Novos snapshots usam o formato 3 com correções e estornos detalhados.