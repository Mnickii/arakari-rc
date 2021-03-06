import { Reaction } from "/client/api";
import { ReactionProduct } from "/lib/api";
import { applyProductRevision } from "/lib/api/products";
import { Products, Tags, Packages } from "/lib/collections";
import { Session } from "meteor/session";
import { Template } from "meteor/templating";
import { ITEMS_INCREMENT } from "/client/config/defaults";

/**
 * loadMoreProducts
 * @summary whenever #productScrollLimitLoader becomes visible, retrieve more results
 * this basically runs this:
 * Session.set('productScrollLimit', Session.get('productScrollLimit') + ITEMS_INCREMENT);
 * @return {undefined}
 */
function loadMoreProducts() {
  let threshold;
  const target = $("#productScrollLimitLoader");
  let scrollContainer = $("#reactionAppContainer");

  if (scrollContainer.length === 0) {
    scrollContainer = $(window);
  }

  if (target.length) {
    threshold = scrollContainer.scrollTop() + scrollContainer.height() - target.height();

    if (target.offset().top < threshold) {
      if (!target.data("visible")) {
        target.data("productScrollLimit", true);
        Session.set("productScrollLimit", Session.get("productScrollLimit") + ITEMS_INCREMENT || 24);
      }
    } else {
      if (target.data("visible")) {
        target.data("visible", false);
      }
    }
  }
}


Template.products.onCreated(function () {
  this.products = ReactiveVar();
  this.state = new ReactiveDict();
  this.state.setDefault({
    initialLoad: true,
    slug: "",
    canLoadMoreProducts: false
  });

  // Update product subscription
  this.autorun(() => {
    const slug = Reaction.Router.getParam("slug");
    const tag = Tags.findOne({ slug: slug }) || Tags.findOne(slug);
    const scrollLimit = Session.get("productScrollLimit");
    let tags = {}; // this could be shop default implementation needed

    if (tag) {
      tags = {tags: [tag._id]};
    }

    // if we get an invalid slug, don't return all products
    if (!tag && slug) {
      return;
    }

    if (this.state.equals("slug", slug) === false && this.state.equals("initialLoad", false)) {
      this.state.set("initialLoad", true);
    }

    this.state.set("slug", slug);

    const queryParams = Object.assign({}, tags, Reaction.Router.current().queryParams);
    this.subscribe("Products", scrollLimit, queryParams);
    
    const user = Meteor.users.findOne({
      _id: Meteor.userId()
    })

    const shop = Session.get('Shop')

    if (shop !== undefined) {
      const isOwner = Roles.userIsInRole(user, 'owner', shop._id);
      const isAdmin = Roles.userIsInRole(user, 'admin', shop._id);

    if (isOwner && !isAdmin) {
        search = {
        ancestors: [],
        vendorShopId: shop._id } 
      } else {
        search = {
        ancestors: []
      }
    }
    } else {
      search = {
        ancestors: []
      }
    }

    // we are caching `currentTag` or if we are not inside tag route, we will
    // use shop name as `base` name for `positions` object
    const currentTag = ReactionProduct.getTag();

    const productCursor = Products.find(search, {
      sort: {
        [`positions.${currentTag}.position`]: 1,
        [`positions.${currentTag}.createdAt`]: 1,
        createdAt: 1
      }
    });

    const products = productCursor.map((product) => {
      return applyProductRevision(product);
    });

    this.state.set("canLoadMoreProducts", productCursor.count() >= Session.get("productScrollLimit"));
    this.products.set(products);
  });

  this.autorun(() => {
    const isActionViewOpen = Reaction.isActionViewOpen();
    if (isActionViewOpen === false) {
      Session.set("productGrid/selectedProducts", []);
    }
  });
});

Template.products.onRendered(() => {
  // run the above func every time the user scrolls
  $("#reactionAppContainer").on("scroll", loadMoreProducts);
  $(window).on("scroll", loadMoreProducts);
});

Template.products.helpers({
  tag: function () {
    const id = Reaction.Router.getParam("_tag");
    return {
      tag: Tags.findOne({ slug: id }) || Tags.findOne(id)
    };
  },

  products() {
    return Template.instance().products.get();
  },

  loadMoreProducts() {
    return Template.instance().state.equals("canLoadMoreProducts", true);
  },

  initialLoad() {
    return Template.instance().state.set("initialLoad", true);
  },

  ready() {
    const instance = Template.instance();
    const isInitialLoad = instance.state.equals("initialLoad", true);
    const isReady = instance.subscriptionsReady();

    if (isInitialLoad === false) {
      return true;
    }

    if (isReady) {
      instance.state.set("initialLoad", false);
      return true;
    }

    return false;
  }
});

/**
 * products events
 */

Template.products.events({
  "click #productListView": function () {
    $(".product-grid").hide();
    return $(".product-list").show();
  },
  "click #productGridView": function () {
    $(".product-list").hide();
    return $(".product-grid").show();
  },
  "click .product-list-item": function () {
    // go to new product
    Reaction.Router.go("product", {
      handle: this._id
    });
  },
  "click [data-event-action=loadMoreProducts]": (event) => {
    event.preventDefault();
    loadMoreProducts();
  }
});
// Social Feeds
Template.socialContent.onCreated(function () {
  this.state = new ReactiveDict();
  this.state.setDefault({
    feeds: {}
  });
  this.autorun(() => {
    this.subscribe("Packages");
    const feedsConfig = Packages.findOne({
      name: "reaction-social"
    });
    this.state.set("feeds", feedsConfig.settings.public.apps);
  });
});
/**
 * Helpers for social integration
 */
Template.socialContent.helpers({
  facebookUrl() {
    const facebookConfig = Template.instance().state.get("feeds").facebook;
    // Check if configuration is enabled and profilepage is set
    if (facebookConfig.enabled && facebookConfig.appId !== "" && facebookConfig.profilePage !== "") {
      // Get the index to substr and get page name using substr
      const index = facebookConfig.profilePage.lastIndexOf("/") + 1;
      // return IFrame src as per https://developers.facebook.com/docs/plugins/page-plugin
      return `https://www.facebook.com/plugins/page.php?href=https%3A%2F%2Fwww.facebook.com%2F${facebookConfig.profilePage.substr(index)}&tabs=timeline&width=1000&height=400&small_header=true&adapt_container_width=true&hide_cover=true&show_facepile=true&appId=${facebookConfig.appId}`;
    }
    return false;
  },
  twitterUrl() {
    const twitterConfig = Template.instance().state.get("feeds").twitter;
    if (twitterConfig.enabled && twitterConfig.profilePage !== "") {
      return twitterConfig.profilePage;
    }
    return false;
  }
});
