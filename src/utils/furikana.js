import pinyin from "pinyin";
import cnchar from "cnchar";
import funikanaData from "./table.json";

// function getChinese(strValue) {
//   if (strValue != null && strValue != "") {
//     var reg = /[\u4e00-\u9fa5]/g;
//     let ret = strValue.match(reg);
//     if (ret != null && ret != "") {
//       return ret.join("");
//     }
//   } else return "";
// }

// function checkCh(ch) {
//   var uni = ch.charCodeAt(0);

//   return uni > 40869 || uni < 19968;
// }
export function ToParsedContent(texts) {
  texts =
    texts
      .split(/(\n|\r\n)/g)
      .filter(
        (v) => v !== "\n" && v !== "\r\n" && v !== "" && v !== "undefined"
      ) || [];
  const arrowTones = ["\u00a0", "→", "↗", "↘↗", "↘", "·"];
  // let hanziContent = getChinese(text);
  let retContents = [];
  for (let t = 0; t < texts.length; t++) {
    let text = texts[t];
    let pinyinContent = pinyin(text, {
      segment: true,
    });
    let retContent = [];
    for (let i = 0, j = 0; i < pinyinContent.length; i++) {
      let tonePinyin = pinyinContent[i][0];
      if (text[j] != tonePinyin[0]) {
        let spellInfo = cnchar.spellInfo(tonePinyin);
        let untonePinyin = spellInfo.spell;
        let tone = spellInfo.tone;
        retContent.push({
          hanzi: text[j],
          isHanzi: true,
          tonePinyin: tonePinyin,
          untonePinyin: untonePinyin,
          tone: tone,
          arrowTone: arrowTones[tone],
          funikana: funikanaData[untonePinyin],
        });
        j++;
      } else {
        let space = "\u00a0".repeat(tonePinyin.length + 1);
        retContent.push({
          hanzi: tonePinyin,
          isHanzi: false,
          tonePinyin: space,
          untonePinyin: space,
          tone: 0,
          arrowTone: arrowTones[0],
          funikana: space,
        });
        j += tonePinyin.length;
      }
    }
    retContents.push(retContent);
  }
  console.log(retContents);
  return retContents;
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function ToHtmlContent(parsedContents, displayMode = 0) {
  // displayMode:
  // 0 标注片假名和箭头音调
  // 1 标注片假名
  // 2 标注有音调拼音
  // 3 标注无音调拼音
  let retContents = [];
  for (let t = 0; t < parsedContents.length; t++) {
    let parsedContent = parsedContents[t];
    let retContent = [];
    for (let i = 0; i < parsedContent.length; i++) {
      let parsedHanzi = parsedContent[i];
      let content = escapeHtml(parsedHanzi.hanzi);
      switch (displayMode) {
        case 0:
          content =
            "<ruby>&nbsp;" +
            content +
            "&nbsp;<rp>(</rp><rt>&nbsp;" +
            escapeHtml(parsedHanzi.funikana) +
            "&nbsp;</rt><rp>)</rp></ruby><rp>(</rp><rt>&nbsp;" +
            escapeHtml(parsedHanzi.arrowTone) +
            "&nbsp;</rt><rp>)</rp>";
          break;
        case 1:
          content =
            "&nbsp;" +
            content +
            "&nbsp;<rp>(</rp><rt>&nbsp;" +
            escapeHtml(parsedHanzi.funikana) +
            "&nbsp;</rt><rp>)</rp>";
          break;
        case 2:
          content =
            "&nbsp;" +
            content +
            "&nbsp;<rp>(</rp><rt>&nbsp;" +
            escapeHtml(parsedHanzi.tonePinyin) +
            "&nbsp;</rt><rp>)</rp>";
          break;
        case 3:
          content =
            "&nbsp;" +
            content +
            "&nbsp;<rp>(</rp><rt>&nbsp;" +
            escapeHtml(parsedHanzi.untonePinyin) +
            "&nbsp;</rt><rp>)</rp>";
          break;
        default:
          console.log("mode error!");
          break;
      }
      retContent.push(content);
    }
    retContents.push("<ruby>" + retContent.join("") + "</ruby>");
  }
  return retContents.join("<br>");
}
