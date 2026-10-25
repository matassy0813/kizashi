# 貢献のしかた / Contributing

ご協力ありがとうございます。不具合の報告や改善の提案は、どなたでも Issue で歓迎します。

## コード・文書の貢献（プルリクエスト）には、同意書（CLA）が必要です

このソフトウェアは **AGPL-3.0-only（無料版）** と **商用ライセンス（有償版）** の 2 つの形で提供しています（デュアルライセンス）。
両方で提供し続けるには、貢献いただいたコードを著作者が両方のライセンスで提供できる必要があります。そのため、**最初のプルリクエストの前に [CLA.md](CLA.md)（貢献者ライセンス同意書）への同意**をお願いしています。

- 同意の方法：プルリクエストの説明欄にある「CLA に同意します」にチェックを入れてください
- 会社の業務として貢献する場合は、会社の承認が必要です（CLA の「法人として貢献する場合」を参照）
- 同意いただけない場合、プルリクエストは取り込めません（Issue での提案は引き続き歓迎します）

## 変更するときのルール（設計の心得）

1. **既存の機能を消さない**：新しい見せ方・方式は追加して切り替えられるようにします。やむを得ず変える場合は、理由と代わりの手段を説明してください
2. **機能は独立させる**：画面・機能ごとにファイルを分け、ある機能の変更が他の機能を壊さないようにします
3. **機能チェックを通す**：ツールを開き、ブラウザのコンソールに `tests/smoke.js` の内容を貼り付けて `runSmoke()` を実行し、全項目が OK であることを確認してください。新しい機能には確認項目を追加してください
4. **画面でも確かめる**：表示の不具合はデータの確認だけでは見つかりません
5. **日本語と英語の両方**の文言を `js/i18n.js` に追加してください
6. 1 ファイル版は `python build.py` で作り直します
7. **見たままが正しい表示（WYSIWYG）にする**：文字や選択した値が欄からはみ出したり、途中で切れたりしないようにします。広がりそうなときは同じセルの中で折り返して表示します。IT に詳しくない人でも迷わず使えることを最優先にします
8. **更新はその場で見せる**：変更したらすぐに保存・反映し、変更した場所を光らせるなどして「今反映された」ことが分かるようにします

---

## English

Issues and suggestions are welcome from everyone. **Pull requests require agreeing to the [Contributor License Agreement](CLA.md)** because this project is dual-licensed (AGPL-3.0-only and a commercial license). Tick the CLA checkbox in the pull request template. If you contribute on behalf of your employer, you need its approval.

When changing code: never silently remove existing features (add alongside and explain any removal), keep features independent, run `runSmoke()` from `tests/smoke.js` until every check passes, verify on screen, add both Japanese and English strings, and rebuild with `python build.py`.
