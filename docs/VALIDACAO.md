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
## Fluxo guiado de cancelamento — 04/11/2026

A ação na lista passou a ser Cancelar. O fluxo tem motivo, conferência dos efeitos e conclusão. Pagamentos e movimentos dependentes são apresentados uma etapa por vez, com retorno ao registro original. A conclusão simples encerra o cancelamento. Registrar dados corretos abre o formulário normal e cria o vínculo automaticamente, na mesma transação do novo lançamento.

CorrectionDatabaseTest aprovou o fluxo transacional com reenvio idempotente, recusa de segundo substituto e falha provocada na gravação do vínculo. A falha confirmou rollback do novo documento e do estoque. O teste de navegador aprovou cancelamento de despesa paga com retorno da etapa financeira, alteração de motivo, conclusão sem substituto, criação de despesa correta com vínculo automático e cancelamento de compra com retorno da venda dependente. O layout de 390 px e os erros JavaScript foram verificados. O build Java/TypeScript e os 24 cenários gerais de integração passaram.

## Estorno financeiro automático — 04/11/2026

A V6 adiciona estornos por alocação, preserva o histórico anterior e atualiza os eventos de caixa e baixas. Cancelar compras, vendas e despesas passou a estornar os valores já pagos na mesma transação. A interface usa uma janela com efeitos, motivo e confirmação, sem etapa separada para o pagamento.

O teste de MySQL conferiu pagamentos parciais, pagamentos compartilhados, cancelamento posterior do saldo restante, histórico de datas anteriores, snapshots e rollback financeiro quando um segundo item de estoque falha. Uma venda com R$ 20 pagos e outra com R$ 30 pagos compartilhavam um recebimento de R$ 50: cancelar a primeira estornou R$ 20 e preservou os R$ 30 da segunda. Cancelar depois o registro financeiro estornou apenas os R$ 30 restantes.

O navegador aprovou estorno automático de compra, venda e despesa, com valor informado na confirmação única, vínculo do registro correto e layout móvel. Os testes unitários, compilação Java e TypeScript e a regressão de compras/vendas/pagamentos foram aprovados.

## Perfil, recuperação e CSV — 04/11/2026

A V7 adiciona a conta persistida no banco. O build aprovou 25 testes unitários; os dois testes de banco optativos ficam separados do build normal. Os testes de CSV verificam registros aninhados, aspas e delimitadores, proteção contra fórmulas de planilha e precisão decimal.

O teste profile.browser.mjs confirmou troca exigindo senha atual, persistência após reiniciar o backend, invalidação de outra sessão aberta, recuperação via SMTP capturado localmente no Mailpit, abertura do link na mesma aba, remoção do token da URL, uso único e expiração. As credenciais originais do ambiente isolado foram restauradas pelo fluxo de senha ao concluir o teste. Nenhum e-mail foi enviado a destinatários reais.

A regressão aprovou 24 cenários gerais, 17 de desconto/paginação, 13 de fechamento, correções, totais por período e navegação de snapshots em computador e celular. Os downloads do fechamento agora são CSV completos e continuam estáveis após mudanças dos cadastros. A integridade do snapshot de origem segue validada internamente.

O envio real depende da configuração de SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, MAIL_FROM e APP_PUBLIC_URL. FALLBACK_MAIL é o destinatário fixo configurado pelo responsável no ambiente.

## Login persistente — 08/11/2026

`tests/remember-login.browser.mjs`, com MySQL isolado e projeto Docker `camarao-remember-qa`, aprovou opção desmarcada por padrão, validade de 30 dias, hash no banco, reabertura somente com cookie persistente, reinício do backend, CSRF obrigatório, logout, novo login sem lembrar, token expirado/malformado e revogação após trocar senha. Layout conferido em 390 px. O teste de perfil também passou com acessos lembrados, incluindo a rejeição do cookie antigo após redefinição por e-mail local. Nenhum e-mail foi enviado para fora do Mailpit.

Para repetir: `docker compose -p camarao-remember-qa -f compose.yaml -f compose.test.yaml -f compose.profile-test.yaml up -d --build --wait`, depois `node tests/remember-login.browser.mjs` e `PROFILE_TEST_PROJECT=camarao-remember-qa node tests/profile.browser.mjs` (no PowerShell, defina a variável pelo `$env:PROFILE_TEST_PROJECT`). Os testes alteram a senha apenas no banco isolado e restauram o valor inicial ao concluir com sucesso.

## Correções da auditoria — 08/11/2026

`tests/audit-fixes.browser.mjs` usa exclusivamente o projeto Docker `camarao-fixes-qa`, MySQL isolado e as portas 18080/15173. Aprovou sete cenários: idempotência concorrente e sequencial para clientes/fornecedores/produtos; conflito por chave reutilizada com outro corpo; obrigatoriedade e formato da chave; rejeição de itens/alocações nulos sem gravações parciais; rejeição de item nulo na recriação; saldo de 0,001 kg exibido como 1 g em celular de 390 px; limite de 20 tentativas por origem, isolamento entre origens, persistência após reinício, proteção contra X-Real-IP forjado pelo cliente do Nginx e mensagem de bloqueio na interface. O teste limpa exclusivamente os contadores de seu próprio banco para deixar as demais suítes independentes.

O build executa dois testes do formatador de pesos e 30 testes Java; os dois testes de banco optativos continuam separados. O Java verifica o limite exato e confiança explícita no proxy, além de validar elementos nulos nas listas. Os testes gerais que exigem banco vazio devem rodar em outro projeto, como `camarao-fixes-regression-qa`.

## Saldo inicial e exportação compacta — 08/11/2026

O build passou com 33 testes Java e dois de formatação de pesos. Os três testes de banco optativos foram executados separadamente e aprovados: correções, fechamento automático e implantação com relógio controlado.

`opening-export.browser.mjs` aprovou nove cenários em MySQL isolado: rejeição de dados inválidos e rollback; cinco confirmações simultâneas com a mesma chave; estorno e nova implantação; conferência pela interface em 390 px; recebimento/pagamento parcial de dívidas antigas sem receita ou despesa fictícia; custo da venda e seu cancelamento; resumo anual com 12 linhas, consolidado e validação dos filtros; download no celular; fechamento preservando os registros de implantação. O teste de banco também verificou datas históricas, pagamentos no dia seguinte, corte às 23h59 e a impossibilidade de desfazer após fechamento ou mudança de dia.

`compact-export-load.mjs` comparou um ano com 10 mil vendas sintéticas: resumo de 12 linhas com 3.260 bytes contra snapshot completo de 12.102.361 bytes. Os totais de vendas e resultado foram conferidos; o resumo foi gerado em aproximadamente 455 ms no ambiente local. A massa foi criada diretamente no banco de teste para medir volume, sem representar importação retroativa suportada pela API.

A regressão geral aprovou os 54 cenários existentes, além da interface de fechamento, download completo de auditoria e preservação dos bytes após editar cadastros. Nenhum saldo inicial foi aplicado automaticamente ao banco operacional. Consulte [Saldo inicial e exportação](SALDOS_E_EXPORTACAO.md).

## Saldo inicial opcional — 08/11/2026

`tests/opening-skip.browser.mjs` aprovou os X da Visão geral e da implantação, escolha persistida após recarregar, configuração manual posterior, limpeza da preferência ao confirmar e compras normais sem implantação. Também verificou ausência de saldo fictício, autenticação, CSRF, entrada inválida e tela de 390 px. O build Java e os testes de formatação passaram. O banco de teste é separado do operacional.

## Código automático de produto — 08/11/2026

`tests/product-code.browser.mjs` aprovou seis cenários em MySQL isolado (`camarao-product-code-v2-qa`): código omitido/nulo/em branco; sequência considerando o produto existente; reenvio idempotente; dez cadastros simultâneos com códigos únicos; compatibilidade com códigos manuais, colisões pela comparação do MySQL e passagem de 999 para 1000; edição sem trocar identificador, inclusive após renomear e sem reutilizar números antigos. O formulário de cadastro e edição foi conferido em 390 px, sem campo de código e sem rolagem horizontal. Dois testes Java adicionais verificam normalização do prefixo e validação do código opcional. A migração V12 é aditiva e preserva os produtos existentes.

Para repetir em um banco novo: `docker compose -p camarao-product-code-qa -f compose.yaml -f compose.test.yaml -f compose.profile-test.yaml up -d --build --wait`, seguido de `node tests/product-code.browser.mjs`. O teste espera a carga inicial de um produto `CAM-001`; use um projeto sem dados anteriores. Não executar contra o banco operacional.

## Caixas e menu de saldo inicial — 10/11/2026

O build passou com 41 testes Java (38 aprovados e três testes de banco optativos não executados nesta rodada) e cinco testes do frontend. Os novos testes verificam conversão exata em gramas, frações de caixa, limites, rejeição de arredondamento, caixas completas com sobras e compatibilidade da serialização de itens antigos com idempotência.

`tests/boxes.browser.mjs` aprovou nove cenários em MySQL isolado: implantação em caixas e conferência em kg; compra sem fornecedor; remoção do saldo inicial do menu após o primeiro lançamento, inclusive depois de recarregar; venda com desconto e pagamento parcial; equivalência em estoque e alteração do peso padrão; perda em meia caixa; validação no servidor, autenticação e CSRF; compras legadas em kg e reenvios idempotentes; cancelamentos de documentos com restauração de quilos e dinheiro; relatórios e dashboards em kg; snapshot versão 5 e CSV preservando o peso original mesmo após alterar o padrão. Cadastro, edição de peso e leitura do estoque foram conferidos em 390 px, sem rolagem horizontal. Os dados operacionais não são usados pelo teste.

Para repetir, escolha um projeto novo de teste: `docker compose -p camarao-boxes-qa -f compose.yaml -f compose.test.yaml -f compose.profile-test.yaml -f compose.boxes-test.yaml up -d --build --wait`, depois `node tests/boxes.browser.mjs`. O último override configura apenas a conta fictícia do teste, sem mudar o `.env` pessoal. O teste exige banco novo e fecha seu dia ao concluir. Não executar contra o ambiente operacional.
