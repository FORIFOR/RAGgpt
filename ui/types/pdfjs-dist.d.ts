declare module "pdfjs-dist/web/pdf_viewer" {
  export { EventBus } from "pdfjs-dist/types/web/event_utils";
  export { PDFLinkService } from "pdfjs-dist/types/web/pdf_link_service";
  export { PDFViewer } from "pdfjs-dist/types/web/pdf_viewer";
  export { PDFSinglePageViewer } from "pdfjs-dist/types/web/pdf_single_page_viewer";
}

declare module "pdfjs-dist/web/pdf_viewer.mjs" {
  export { EventBus } from "pdfjs-dist/types/web/event_utils";
  export { PDFLinkService } from "pdfjs-dist/types/web/pdf_link_service";
  export { PDFViewer } from "pdfjs-dist/types/web/pdf_viewer";
  export { PDFSinglePageViewer } from "pdfjs-dist/types/web/pdf_single_page_viewer";
  export { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
}
