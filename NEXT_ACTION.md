# Next Action

`npm run workflow:next` ausführen und dessen aktuelle, abgeleitete `NEXT_ALLOWED_ACTION` verwenden. Die nächste Aktion nicht manuell in dieser Datei nachführen. `workflow:continue` führt den fälligen Testschritt aus oder nennt Implementer beziehungsweise Reviewer. Ein Human Gate blockiert erst eine konkrete geschützte externe Aktion, nicht die lokale Vorbereitung.

Diese Datei speichert niemals eine Merge-, Preview- oder Live-Freigabe. Human Approval muss am jeweiligen Gate neu und ausdrücklich erfolgen.
