// Vervang dit met de naam van je werkblad als dat anders is (standaard "Blad1" of "Sheet1")
const SHEET_NAME = "Blad1";

// Functie die wordt aangeroepen bij een GET-verzoek (ophalen van data)
function doGet(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    
    // Maak headers aan als ze niet bestaan
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Naam', 'Locatie', 'Datum', 'Starttijd', 'Eindtijd', 'Totaal Uren', 'Opmerkingen']);
    }
    
    // Gebruik getDisplayValues om exacte tekst uit de cellen te halen, dit voorkomt tijdzone problemen
    const data = sheet.getDataRange().getDisplayValues();
    const headers = data.shift(); // Verwijder de kopteksten (rij 1)
    
    const entries = data.map((row, index) => {
      // Gebruik kolom 8 (index 7) als ID. Bij oude rijen verzinnen we een fallback.
      const entryId = row[7] ? String(row[7]) : `old_${index}`;
      return {
        id: entryId,
        naam: row[0],
        location: row[1],
        date: row[2],
        startTime: row[3],
        endTime: row[4],
        duration: row[5],
        notes: row[6]
      };
    });
    
    return createJsonResponse({ status: 'success', data: entries });
  } catch (error) {
    return createJsonResponse({ status: 'error', message: error.toString() });
  }
}

// Functie die wordt aangeroepen bij een POST-verzoek (opslaan van nieuwe data)
function doPost(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    const postData = JSON.parse(e.postData.contents);
    
    // Maak headers aan als ze niet bestaan
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Naam', 'Locatie', 'Datum', 'Starttijd', 'Eindtijd', 'Totaal Uren', 'Opmerkingen', 'ID']);
    }
    
    // Opslaan van een nieuwe urenregistratie
    if (postData.action === 'add') {
      const { id, location, date, startTime, endTime, duration, notes } = postData.entry;
      const newId = id || generateId(); // Fallback als app geen ID stuurt
      
      // Controleer of deze ID al in kolom 8 (H) staat
      if (sheet.getLastRow() > 1) {
        const idRange = sheet.getRange(2, 8, sheet.getLastRow() - 1, 1).getValues();
        const exists = idRange.some(row => String(row[0]) === String(newId));
        if (exists) {
          // ID bestaat al, return success zonder dubbel toe te voegen!
          return createJsonResponse({ status: 'success', message: 'Duplicate avoided' });
        }
      }
      
      // Converteer datum naar een echt Date object (12:00 uur voorkomt tijdzone verschuivingen)
      let dateObj = date;
      if (date && date.includes('-')) {
        const parts = date.split('-');
        if (parts[0].length === 4) {
           dateObj = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
        }
      }
      
      // Zorg dat uren een getal (Number) is in plaats van tekst
      let numDuration = duration ? parseFloat(duration) : "";
      
      // We zetten "Jill" als Naam, Kolom 8 is het ID
      sheet.appendRow(["Jill", location || "", dateObj, startTime, endTime, numDuration, notes || "", newId]);
      
      const lastRow = sheet.getLastRow();
      
      // Forceer Europese opmaak voor de datum (Kolom C) en kommagetallen voor uren (Kolom F)
      sheet.getRange(lastRow, 3).setNumberFormat("dd-mm-yyyy");
      sheet.getRange(lastRow, 6).setNumberFormat("0.00");
      
      // Sorteer de sheet altijd netjes op Datum (Kolom 3) en daarna Starttijd (Kolom 4)
      if (lastRow > 1) {
         const range = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
         range.sort([{column: 3, ascending: true}, {column: 4, ascending: true}]);
      }
      
      return createJsonResponse({ status: 'success' });
    }
    
    // Verwijderen van een urenregistratie op basis van ID
    if (postData.action === 'delete') {
      const idToDelete = String(postData.id);
      
      // Compatibiliteit met oude ID's ("old_0")
      if (idToDelete.startsWith("old_")) {
        const rowIndex = parseInt(idToDelete.replace("old_", ""), 10);
        if (!isNaN(rowIndex)) {
          sheet.deleteRow(rowIndex + 2); // index 0 is rij 2
          return createJsonResponse({ status: 'success' });
        }
      }
      
      // Normale verwijdering op basis van unieke ID (Zoeken in kolom 8)
      if (sheet.getLastRow() > 1) {
        const idRange = sheet.getRange(2, 8, sheet.getLastRow() - 1, 1).getValues();
        let foundRowIndex = -1;
        for (let i = 0; i < idRange.length; i++) {
          if (String(idRange[i][0]) === idToDelete) {
            foundRowIndex = i + 2; // +2 want arrays starten op 0 en data start op rij 2
            break;
          }
        }
        
        if (foundRowIndex !== -1) {
          sheet.deleteRow(foundRowIndex);
          return createJsonResponse({ status: 'success' });
        } else {
          // Als ID niet gevonden wordt, betekent het dat hij lokaal al gewist was, we geven success!
          return createJsonResponse({ status: 'success', message: 'Already deleted' });
        }
      }
      
      return createJsonResponse({ status: 'error', message: 'ID niet gevonden' });
    }
    
    return createJsonResponse({ status: 'error', message: 'Onbekende actie' });
  } catch (error) {
    return createJsonResponse({ status: 'error', message: error.toString() });
  }
}

// Omdat Google Apps Script preflight requests (OPTIONS) vereist voor POST vanaf een ander domein, 
// handelen we dit hier af door succes terug te sturen als web app dit vereist (vaak niet nodig voor simpele fetch, maar goed voor de zekerheid)
function doOptions(e) {
    return createJsonResponse({ status: 'success' });
}

// Hulpmiddel om JSON reacties terug te sturen
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// Genereer een simpele unieke ID
function generateId() {
  return Utilities.getUuid();
}
