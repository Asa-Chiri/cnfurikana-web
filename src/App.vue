<template>
  <div id="app">
    <el-container>
      <el-header>
        <el-col :span="16">
          {{ $t("title") }}
        </el-col>
        <el-col :span="7">
          <el-select
            v-model="selectedLang"
            placeholder="语言/語言/Language/言語を選択"
            @change="changeLang"
          >
            <el-option
              v-for="item in langs"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            >
            </el-option>
          </el-select>
        </el-col>
        <el-col :span="1">
          <a
            href="https://github.com/Zhaoweicheng98/cnfurikana-web"
            target="_blank"
            ><i class="el-icon-info"></i
          ></a>
        </el-col>
      </el-header>
      <el-main>
        <el-row :gutter="10">
          <el-col :span="6">{{ $t("modeSelector.label") }}</el-col>
          <el-col :span="12">
            <el-select v-model="selectedMode">
              <el-option
                v-for="item in displayModes"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              >
              </el-option>
            </el-select>
          </el-col>
        </el-row>
        <el-row :gutter="10">
          <el-col :span="6">{{ $t("input.label") }}</el-col>
          <el-col :span="12">
            <el-input
              :placeholder="$t('input.placeholder')"
              v-model="inputContent"
              clearable
            >
            </el-input>
          </el-col>
        </el-row>
        <el-row :gutter="10">
          <el-col :span="6">{{ $t("fileUploader.label") }}</el-col>
          <el-col :span="12">
            <el-upload
              class="upload-demo"
              action="/"
              ref="upload"
              accept=".txt"
              :before-upload="beforeUpload"
              :disabled="this.fileList.length !== 0"
              :file-list="this.fileList"
              drag
              multiple
            >
              <i class="el-icon-upload"></i>
              <div class="el-upload__text">
                {{ $t("fileUploader.text")
                }}<em>{{ $t("fileUploader.click") }}</em>
              </div>
              <div class="el-upload__tip" slot="tip">
                {{ $t("fileUploader.tip") }}
              </div>
            </el-upload>
          </el-col>
        </el-row>
        <el-button type="danger" round v-on:click="clear">{{
          $t("clear")
        }}</el-button>
        <el-button type="primary" round v-on:click="playAudio">{{
          $t("playAudio")
        }}</el-button>
        <furikana-display :content="content" :displayMode="selectedMode" />
      </el-main>
    </el-container>
  </div>
</template>

<script>
import FurikanaDisplay from "./components/FurikanaDisplay.vue";
import Speech from "speak-tts";

export default {
  name: "App",
  components: {
    FurikanaDisplay,
  },
  data() {
    return {
      inputContent: "",
      fileContent: "",
      fileList: [],
      fileReadGeneration: 0,
      langs: [
        {
          value: "zh_CN",
          label: "简体中文",
        },
        {
          value: "zh_TW",
          label: "繁體中文",
        },
        {
          value: "en_US",
          label: "English",
        },
        {
          value: "ja_JP",
          label: "日本語",
        },
      ],
      selectedMode: 0,
      selectedLang: this.$i18n.locale,
      speech: null,
    };
  },
  mounted() {
    this.speechInit();
  },
  beforeCreate() {
    this.$i18n.locale = localStorage.getItem("lang") || "zh_CN";
    // 读取文件
    FileReader.prototype.reading = function ({ encode }) {
      let bytes = new Uint8Array(this.result); //无符号整型数组
      let text = new TextDecoder(encode || "UTF-8").decode(bytes);
      return text;
    };
    /* 重写readAsBinaryString函数 */
    FileReader.prototype.readAsBinaryString = function (f) {
      if (!this.onload)
        //如果this未重写onload函数，则创建一个公共处理方式
        this.onload = () => {
          //在this.onload函数中，完成公共处理
          let rs = this.reading();
          console.log(rs);
        };
      this.readAsArrayBuffer(f); //内部会回调this.onload方法
    };
  },
  methods: {
    speechInit() {
      this.speech = new Speech();
      this.speech.setLanguage("zh-CN");
      this.speech.init().then(() => {});
    },
    beforeUpload(file) {
      this.fileList = [file];
      console.log("选择了文件beforeUpload");
      // 读取数据
      this.read(file);
      return false;
    },
    read(f) {
      const generation = ++this.fileReadGeneration;
      let rd = new FileReader();
      rd.onload = () => {
        // Clear or a newer file read makes this result obsolete.
        if (generation !== this.fileReadGeneration) return;
        //this.readAsArrayBuffer函数内，会回调this.onload函数。在这里处理结果
        let cont = rd.reading({ encode: "UTF-8" });
        console.log(cont);
        let formerData = this.textData;
        this.fileContent = formerData + "\n" + cont;
      };
      rd.readAsBinaryString(f);
    },
    clear() {
      this.fileReadGeneration++;
      console.log("cleared");
      this.fileContent = "";
      this.inputContent = "";
      this.fileList = [];
    },
    changeLang() {
      this.$i18n.locale = this.selectedLang;
      localStorage.setItem("lang", this.selectedLang);
    },
    playAudio() {
      let texts =
        this.content
          .split(/(\n|\r\n)/g)
          .filter(
            (v) => v !== "\n" && v !== "\r\n" && v !== "" && v !== "undefined"
          ) || [];
      this.speech.speak({ text: texts.join("\n") }).then(() => {
        console.log("读取成功");
      });
    },
  },
  computed: {
    content: function () {
      if (this.fileContent != null && this.fileContent != "") {
        return this.fileContent;
      }
      if (this.inputContent != null && this.inputContent != "") {
        return this.inputContent;
      }
      return "";
    },
    displayModes: function () {
      return [
        {
          value: 0,
          label: this.$t("modeSelector.choiceLabel0"),
        },
        {
          value: 1,
          label: this.$t("modeSelector.choiceLabel1"),
        },
        {
          value: 2,
          label: this.$t("modeSelector.choiceLabel2"),
        },
        {
          value: 3,
          label: this.$t("modeSelector.choiceLabel3"),
        },
      ];
    },
  },
};
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: left;
  color: #2c3e50;
  margin-top: 60px;
}
.el-header,
.el-footer {
  background-color: #b3c0d1;
  color: #333;
  text-align: left;
  line-height: 60px;
}

.el-aside {
  background-color: #d3dce6;
  color: #333;
  text-align: left;
  line-height: 200px;
}

.el-main {
  background-color: #e9eef3;
  color: #333;
  text-align: left;
}

.el-row el-col {
  vertical-align: middle;
}

body > .el-container {
  margin-bottom: 40px;
}

.el-container:nth-child(5) .el-aside,
.el-container:nth-child(6) .el-aside {
  line-height: 260px;
}

.el-container:nth-child(7) .el-aside {
  line-height: 320px;
}

.el-row {
  margin-bottom: 20px;
}

.el-col {
  border-radius: 4px;
}
</style>
