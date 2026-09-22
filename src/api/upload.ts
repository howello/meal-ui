import { getToken } from "@/utils/auth";
import { UPLOAD_API } from "@/utils/env";

/**
 * 上传图片，返回后端给出的可访问地址
 *
 * 后端把文件转存到对象存储后返回完整 URL，前端直接使用，不要自己拼 baseURL。
 */
export function uploadImage(filePath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    uni.uploadFile({
      url: UPLOAD_API,
      filePath,
      name: "file",
      header: {
        Authorization: `Bearer ${getToken()}`,
      },
      success: (res) => {
        try {
          const body = JSON.parse(res.data);
          if (body.code === 200) {
            resolve(body.url || body.fileName || "");
          } else {
            uni.showToast({ title: body.msg || "上传失败", icon: "none" });
            reject(new Error(body.msg || "上传失败"));
          }
        } catch (e) {
          reject(new Error("上传响应解析失败"));
        }
      },
      fail: () => {
        uni.showToast({ title: "上传失败", icon: "none" });
        reject(new Error("上传失败"));
      },
    });
  });
}
