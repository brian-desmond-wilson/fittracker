import { useState } from "react";
import { FoodInventoryItem } from "@/src/types/track";

export type FoodImageType = "primary" | "front" | "back" | "side";

/** Exactly the fields this hook reads. It used to ask for a whole
 *  `FoodInventoryItemWithCategories`, which coupled it to the legacy
 *  `total_quantity`/`ready_quantity`/`storage_quantity` mirrors it never
 *  touched — so deleting those mirrors broke this call site for no reason. */
type FoodImageSeed = Pick<
  FoodInventoryItem,
  "image_primary_url" | "image_front_url" | "image_back_url" | "image_side_url"
>;

/**
 * Owns the four food-image URIs. Values seed from the item and hold whatever
 * the picker last handed over: a local `file://` from the camera or the
 * library, which Save uploads, or an `https://` the server already copied into
 * our bucket, which Save passes through untouched.
 *
 * It used to own the picker too — an iOS action sheet offering a camera and a
 * library and nothing else. That flow now lives in `PhotoSourceSheet`, which
 * offers those two plus web search and a pasted address, and knows nothing
 * about which of the four faces it is filling. `setFor` is the seam: the
 * screen says which slot, the sheet says which picture.
 */
export function useFoodImages(item: FoodImageSeed) {
  const [imagePrimary, setImagePrimary] = useState<string | null>(item.image_primary_url);
  const [imageFront, setImageFront] = useState<string | null>(item.image_front_url);
  const [imageBack, setImageBack] = useState<string | null>(item.image_back_url);
  const [imageSide, setImageSide] = useState<string | null>(item.image_side_url);

  /** One writer keyed by slot, so callers stop re-deriving the same
   *  four-branch ladder every time they need to set or clear a face. */
  const setFor = (type: FoodImageType, uri: string | null) => {
    ({
      primary: setImagePrimary,
      front: setImageFront,
      back: setImageBack,
      side: setImageSide,
    })[type](uri);
  };

  const imageFor = (type: FoodImageType): string | null =>
    ({ primary: imagePrimary, front: imageFront, back: imageBack, side: imageSide })[type];

  return {
    imagePrimary,
    imageFront,
    imageBack,
    imageSide,
    setImagePrimary,
    setImageFront,
    setImageBack,
    setImageSide,
    setFor,
    imageFor,
  };
}
